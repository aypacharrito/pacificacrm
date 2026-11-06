import {ScaledText as Text} from "../../src/components/Primitives";
import { router } from "expo-router";
import NoteReminders from "../../src/components/NoteReminders";
import React, { useMemo } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Card, Icon, ListItem, Muted, Pill, SectionTitle, Title, usePalette, type IconName } from "../../src/components/Primitives";
import { LeadRow } from "../../src/components/LeadRow";
import { followUpDue, isHotLead } from "../../src/lib/lead";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

export default function TodayScreen() {
  const p = usePalette();
  const { workspace, loading, offline, syncing, error, refresh } = useWorkspace();

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
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={p.green} colors={[String(p.green)]} />}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}><Title>Today</Title></View>
        {offline ? <Pill active>Offline</Pill> : <Pill>{syncing ? "Syncing" : "Synced"}</Pill>}
      </View>

      {error ? <Card><Text style={{ color: offline ? p.warning : p.danger, fontWeight: "600" }}>{error}</Text></Card> : null}

      <Pressable accessibilityRole="button" onPress={() => router.push("/ai")} style={({ pressed }) => [styles.capture, { backgroundColor: p.greenSoft, opacity: pressed ? .85 : 1 }]}>
        <View style={[styles.captureIcon, { backgroundColor: p.green }]}><Icon name="camera-outline" color={p.onGreen} size={24} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: p.text, fontWeight: "700", fontSize: 17 }}>Photo to contact</Text>
          <Text style={{ color: p.text, opacity: .8, fontSize: 13, lineHeight: 18 }}>Snap a number or business card. Pacifica AI fills in a contact for you to check.</Text>
        </View>
        <Icon name="chevron-right" color={p.green} />
      </Pressable>

      <NoteReminders/>

      <View style={styles.metrics}>
        <Metric icon="account-group-outline" label="Leads" value={workspace.leads.length} />
        <Metric icon="star-outline" label="Priority" value={hot.length} />
        <Metric icon="calendar-clock" label="Follow-ups" value={due.length} />
        <Metric icon="phone-outline" label="Calls today" value={callsToday} />
      </View>

      <Card style={{ padding: 0, paddingVertical: 4 }}>
        <ListItem icon="car-outline" title="Drive Mode" subtitle="A simple calling queue for safe stops between calls." onPress={() => router.push("/drive")} />
      </Card>

      <SectionTitle right={<Muted>{queue.length ? `${queue.length} contacts` : ""}</Muted>}>Next up</SectionTitle>
      <Card style={{ padding: 6 }}>
        {queue.length ? queue.map(lead => <LeadRow key={lead.id} lead={lead} />) : <View style={{ padding: 14 }}><Muted>Your queue is clear. Add or import leads in Pacifica web, then pull down to refresh.</Muted></View>}
      </Card>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  const p = usePalette();
  return (
    <Card style={styles.metric}>
      <Icon name={icon} color={p.green} size={20} />
      <Text style={[styles.metricValue, { color: p.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: p.muted }]}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  capture: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 24, padding: 16 },
  captureIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexBasis: "47%", flexGrow: 1, gap: 2 },
  metricValue: { fontSize: 28, fontWeight: "700", letterSpacing: -.5, marginTop: 6 },
  metricLabel: { fontSize: 13, fontWeight: "600" },
});
