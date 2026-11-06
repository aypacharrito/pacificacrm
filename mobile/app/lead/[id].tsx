import {ScaledText as Text} from "../../src/components/Primitives";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Avatar, Button, Card, Field, IconButton, Muted, Pill, Title, usePalette } from "../../src/components/Primitives";
import { displayStage, formatPhone } from "../../src/lib/lead";
import { openDeviceAction, phoneCallUrl } from "../../src/lib/device-actions";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

const outcomes = ["Contacted", "Quoted", "Appointment Set", "Sold", "Follow-up", "No answer"];

export default function LeadDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const p = usePalette();
  const { workspace, updateLead, syncing } = useWorkspace();
  const lead = useMemo(() => workspace.leads.find(item => item.id === id), [workspace.leads, id]);
  const [note, setNote] = useState("");

  if (!lead) {
    return <Screen><Title>Lead not found</Title><Button title="Back" kind="secondary" onPress={() => router.back()} /></Screen>;
  }

  async function openUrl(url: string) {
    try {
      await openDeviceAction(url, Linking.openURL);
    } catch (error) {
      Alert.alert("Unable to open", error instanceof Error ? error.message : "Try again.");
    }
  }

  async function saveNote() {
    const cleaned = note.trim();
    if (!cleaned || !lead) return;
    const timestamp = new Date().toLocaleString();
    const combined = [lead.notes?.trim(), `[Mobile ${timestamp}] ${cleaned}`].filter(Boolean).join("\n");
    await updateLead(lead.id, { notes: combined, lastContact: new Date().toISOString() });
    setNote("");
  }

  return (
    <Screen>
      <View style={{ marginLeft: -8 }}><IconButton icon="arrow-left" label="Back" onPress={() => router.back()} /></View>
      <View style={styles.hero}>
        <Avatar name={lead.name || "?"} size={88} />
        <Text style={[styles.heroName, { color: p.text }]}>{lead.name}</Text>
        <Muted>{formatPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ""}</Muted>
        <Pill>{lead.line === "home-auto" ? "Home & Auto" : "Life / Lead"}</Pill>
      </View>

      <View style={styles.actions}>
        <Button title="Call" icon="phone" onPress={() => void openUrl(phoneCallUrl(lead.phone))} disabled={!lead.phone || lead.doNotCall} style={styles.action} />
        <Button title="Text" icon="message-text-outline" kind="tonal" onPress={() => router.push(`/conversation/${lead.id}`)} disabled={!lead.phone || lead.smsOptOut || lead.doNotCall} style={styles.action} />
        <Button title="Email" icon="email-outline" kind="tonal" onPress={() => void openUrl(`mailto:${lead.email}`)} disabled={!lead.email || lead.emailOptOut} style={styles.action} />
      </View>

      {lead.doNotCall ? <Card><Text style={{ color: p.danger, fontWeight: "900" }}>Do Not Call is enabled for this contact.</Text></Card> : null}

      <Card style={styles.details}>
        <Detail label="Stage" value={displayStage(lead)} />
        <Detail label="Outcome" value={lead.outcome || "Not contacted"} />
        <Detail label="Product" value={lead.product || "—"} />
        <Detail label="Source" value={lead.source || "—"} />
        <Detail label="Address" value={[lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ") || "—"} />
        <Detail label="DOB" value={lead.dateOfBirth || "—"} />
        <Detail label="License" value={[lead.licenseNumber, lead.licenseState].filter(Boolean).join(" · ") || "—"} />
        <Detail label="VIN" value={lead.vin || "—"} />
        <Detail label="Follow-up" value={lead.followUp ? new Date(lead.followUp).toLocaleString() : "—"} />
      </Card>

      <View style={{ gap: 8 }}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Quick outcome</Text>
        <View style={styles.outcomes}>
          {outcomes.map(outcome => (
            <Pressable key={outcome} onPress={() => void updateLead(lead.id, {
              outcome,
              sourceDisposition: outcome,
              lastContact: new Date().toISOString(),
              attempts: Number(lead.attempts || 0) + 1,
              lastAttemptAt: new Date().toISOString(),
            })}>
              <Pill active={lead.outcome === outcome}>{outcome}</Pill>
            </Pressable>
          ))}
        </View>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Add note</Text>
        <Field value={note} onChangeText={setNote} placeholder="Type a note..." multiline style={{ minHeight: 92, paddingTop: 12 }} />
        <Button title="Save note" loading={syncing} onPress={() => void saveNote()} disabled={!note.trim()} />
      </Card>

      {lead.notes ? <Card style={{ gap: 7 }}><Text style={[styles.sectionTitle, { color: p.text }]}>Notes</Text><Muted>{lead.notes}</Muted></Card> : null}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return <View style={[styles.detailRow, { borderBottomColor: p.border }]}>
    <Text style={[styles.detailLabel, { color: p.muted }]}>{label}</Text>
    <Text selectable style={[styles.detailValue, { color: p.text }]}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingBottom: 4 },
  heroName: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, minWidth: 0 },
  details: { paddingVertical: 4 },
  detailRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: .8 },
  detailValue: { fontSize: 15, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "900" },
  outcomes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
