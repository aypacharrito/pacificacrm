import {ScaledText as Text} from "../../src/components/Primitives";
import { router } from "expo-router";
import NoteReminders from "../../src/components/NoteReminders";
import React, { useMemo } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Button, Card, Muted, Pill, Title, usePalette } from "../../src/components/Primitives";
import { LeadRow } from "../../src/components/LeadRow";
import { followUpDue, isHotLead } from "../../src/lib/lead";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

export default function TodayScreen() {
  const p = usePalette();
  const { workspace, loading, offline, error, refresh } = useWorkspace();

  const hot = useMemo(() => workspace.leads.filter(isHotLead), [workspace.leads]);
  const due = useMemo(() => workspace.leads.filter(followUpDue), [workspace.leads]);
  const callsToday = useMemo(() => {
    const today = new Date().toDateString();
    return workspace.callLogs.filter(log => new Date(log.startedAt).toDateString() === today).length;
  }, [workspace.callLogs]);

  const queue = useMemo(() => {
    const unique = new Map<number, (typeof workspace.leads)[number]>();
    [...due, ...hot, ...workspace.leads].forEach(lead => unique.set(lead.id, lead));
    return [...unique.values()].slice(0, 8);
  }, [due, hot, workspace]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={p.green} />}>
      <View style={styles.heading}>
        <Title eyebrow="PACIFICA">Today</Title>
        <View style={styles.status}>{offline ? <Pill active>Offline cache</Pill> : <Pill>Synced</Pill>}</View>
      </View>

      {error ? <Card><Text style={{ color: offline ? p.warning : p.danger, fontWeight: "700" }}>{error}</Text></Card> : null}

      <Card><Title eyebrow="PHOTO TO CONTACT">Capture it on the go</Title><Muted>Photograph a number, business card, or contact details. Pacifica AI prepares a contact for you to review.</Muted><Button title="Open Pacifica AI" onPress={() => router.push("/ai")} /></Card>

      <NoteReminders/>
      <View style={styles.metrics}>
        <Metric label="Leads" value={workspace.leads.length} />
        <Metric label="Priority" value={hot.length} />
        <Metric label="Follow-ups" value={due.length} />
        <Metric label="Calls today" value={callsToday} />
      </View>

      <Card style={styles.drive}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.driveTitle, { color: p.text }]}>Drive Mode</Text>
          <Muted>Hands-simple lead queue for safe stops between calls.</Muted>
        </View>
        <Button title="Open" kind="secondary" onPress={() => router.push("/drive")} />
      </Card>

      <View style={styles.sectionTitle}>
        <Text style={[styles.sectionText, { color: p.text }]}>Next up</Text>
        <Muted>{queue.length ? `${queue.length} prioritized contacts` : "Your queue is clear"}</Muted>
      </View>
      <Card style={{ paddingVertical: 2 }}>
        {queue.length ? queue.map(lead => <LeadRow key={lead.id} lead={lead} />) : <View style={{ padding: 18 }}><Muted>No leads yet. Add or import leads from Pacifica web and pull to refresh.</Muted></View>}
      </Card>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const p = usePalette();
  return (
    <Card style={styles.metric}>
      <Text style={[styles.metricValue, { color: p.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: p.muted }]}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  status: { paddingBottom: 4 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", minHeight: 94, justifyContent: "center" },
  metricValue: { fontSize: 29, fontWeight: "900", letterSpacing: -1 },
  metricLabel: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  drive: { flexDirection: "row", alignItems: "center", gap: 12 },
  driveTitle: { fontWeight: "900", fontSize: 17 },
  sectionTitle: { gap: 2, marginTop: 4 },
  sectionText: { fontSize: 18, fontWeight: "900" },
});
