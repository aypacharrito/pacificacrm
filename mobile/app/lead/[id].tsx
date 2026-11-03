import {ScaledText as Text} from "../../src/components/Primitives";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Button, Card, Field, Muted, Pill, Title, usePalette } from "../../src/components/Primitives";
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
      <Pressable onPress={() => router.back()}><Text style={{ color: p.green, fontWeight: "800" }}>‹ Back</Text></Pressable>
      <View style={{ gap: 5 }}>
        <Title eyebrow={lead.line === "home-auto" ? "HOME & AUTO" : "LIFE / LEAD"}>{lead.name}</Title>
        <Muted>{formatPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ""}</Muted>
      </View>

      <View style={styles.actions}>
        <Button title="Call" onPress={() => void openUrl(phoneCallUrl(lead.phone))} disabled={!lead.phone || lead.doNotCall} style={styles.action} />
        <Button title="Text" kind="secondary" onPress={() => router.push(`/conversation/${lead.id}`)} disabled={!lead.phone || lead.smsOptOut || lead.doNotCall} style={styles.action} />
        <Button title="Email" kind="secondary" onPress={() => void openUrl(`mailto:${lead.email}`)} disabled={!lead.email || lead.emailOptOut} style={styles.action} />
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
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, minWidth: 0 },
  details: { paddingVertical: 4 },
  detailRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: .8 },
  detailValue: { fontSize: 15, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "900" },
  outcomes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
