import {ScaledText as Text} from "../../src/components/Primitives";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Button, Card, Muted, Pill, Title, usePalette } from "../../src/components/Primitives";
import { isHotLead } from "../../src/lib/lead";
import { openDeviceAction, phoneCallUrl } from "../../src/lib/device-actions";
import { useWorkspace } from "../../src/state/WorkspaceProvider";
import {
  beginDriveCall,
  createDriveSession,
  currentDriveLead,
  finishDriveCall,
  pauseDriveSession,
  resumeDriveSession,
  saveDriveDisposition,
  startDriveSession,
} from "../../src/drive-session";

export default function DriveModeScreen() {
  const p = usePalette();
  const { workspace, updateLead } = useWorkspace();
  const queue = useMemo(() => [...workspace.leads]
    .filter(lead => Boolean(lead.phone) && !lead.doNotCall)
    .sort((a,b) => Number(isHotLead(b)) - Number(isHotLead(a)))
    .slice(0, 50)
    .map(lead => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      product: lead.product,
      source: lead.source,
      priorityReason: isHotLead(lead) ? "Priority lead" : lead.stage || "Ready",
    })), [workspace.leads]);

  const [session, setSession] = useState(() => createDriveSession(queue));
  const lead = currentDriveLead(session);

  function call() {
    if (!lead) return;
    setSession(current => beginDriveCall(current));
    void openDeviceAction(phoneCallUrl(lead.phone), Linking.openURL);
  }

  async function disposition(value: string) {
    if (!lead) return;
    const crmLead = workspace.leads.find(item => item.id === lead.id);
    await updateLead(lead.id, {
      outcome: value,
      sourceDisposition: value,
      lastContact: new Date().toISOString(),
      attempts: Number(crmLead?.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString(),
    });
    setSession(current => saveDriveDisposition(current, value));
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()}><Text style={{ color: p.green, fontWeight: "900" }}>Close</Text></Pressable>
        <Pill>{session.completed}/{session.queue.length}</Pill>
      </View>

      <Title eyebrow="DRIVE MODE">{session.phase === "finished" ? "Queue complete" : session.phase === "paused" ? "Paused" : lead?.name || "Ready"}</Title>

      {session.phase === "idle" ? (
        <Card style={styles.hero}>
          <Text style={[styles.big, { color: p.text }]}>{queue.length}</Text>
          <Muted>callable leads prioritized from your Pacifica workspace.</Muted>
          <Button title="Start queue" onPress={() => setSession(current => startDriveSession(current))} />
        </Card>
      ) : null}

      {lead && !["idle", "finished"].includes(session.phase) ? (
        <Card style={styles.hero}>
          <Text style={[styles.phone, { color: p.text }]}>{lead.phone}</Text>
          <Muted>{lead.product || "Lead"} · {lead.source || "Pacifica"}</Muted>
          <Pill active>{lead.priorityReason}</Pill>

          {session.phase === "briefing" ? <Button title="Call now" onPress={call} /> : null}

          {session.phase === "calling" ? (
            <>
              <Muted>After the phone call ends, choose what happened.</Muted>
              <View style={styles.buttons}>
                <Button title="Connected" onPress={() => setSession(current => finishDriveCall(current, true))} style={{ flex: 1 }} />
                <Button title="No answer" kind="secondary" onPress={() => {
                  void updateLead(lead.id, { outcome: "No answer", lastContact: new Date().toISOString() });
                  setSession(current => finishDriveCall(current, false));
                }} style={{ flex: 1 }} />
              </View>
            </>
          ) : null}

          {session.phase === "wrap-up" ? (
            <View style={styles.wrap}>
              {["Contacted", "Quoted", "Appointment Set", "Sold", "Follow-up"].map(item => (
                <Button key={item} title={item} kind={item === "Sold" ? "primary" : "secondary"} onPress={() => void disposition(item)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {session.phase === "paused" ? <Card style={styles.hero}><Muted>Your place is saved.</Muted><Button title="Resume" onPress={() => setSession(current => resumeDriveSession(current))} /></Card> : null}
      {session.phase === "finished" ? <Card style={styles.hero}><Text style={[styles.big, { color: p.green }]}>Done</Text><Muted>{session.completed} contacts completed.</Muted><Button title="Close Drive Mode" onPress={() => router.back()} /></Card> : null}

      {!["idle", "paused", "finished"].includes(session.phase) ? <Button title="Pause queue" kind="secondary" onPress={() => setSession(current => pauseDriveSession(current))} /> : null}
      <Muted>Use Drive Mode only when safely parked or with hands-free controls. Pacifica does not encourage interacting with the screen while driving.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: "center" },
  top: { position: "absolute", left: 18, right: 18, top: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hero: { gap: 16 },
  big: { fontSize: 52, lineHeight: 58, fontWeight: "900", letterSpacing: -2 },
  phone: { fontSize: 22, fontWeight: "900" },
  buttons: { flexDirection: "row", gap: 8 },
  wrap: { gap: 9 },
});
