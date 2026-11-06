import {ScaledText as Text} from "../../src/components/Primitives";
import React, { useMemo } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Avatar, Card, Icon, Muted, Title, usePalette, useRipple } from "../../src/components/Primitives";
import { shortTime } from "../../src/lib/format";
import { useWorkspace } from "../../src/state/WorkspaceProvider";
import type { Communication, Lead } from "../../src/lib/types";

type InboxItem = { lead: Lead; communication: Communication; time: number };

function commTime(item: Communication) {
  const raw = item.sentAt || item.createdAt || item.timestamp || item.at || "";
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

export default function InboxScreen() {
  const p = usePalette();
  const ripple = useRipple();
  const { workspace, markMessagesRead } = useWorkspace();
  useFocusEffect(React.useCallback(() => { void markMessagesRead(); }, [markMessagesRead]));
  const items = useMemo(() => {
    const collected: InboxItem[] = [];
    for (const lead of workspace.leads) {
      for (const communication of Array.isArray(lead.communications) ? lead.communications : []) {
        collected.push({ lead, communication, time: commTime(communication) });
      }
    }
    const latest=new Map<number,InboxItem>();
    for(const item of collected.sort((a,b)=>b.time-a.time)){if(!item.lead.deletedAt&&!latest.has(item.lead.id))latest.set(item.lead.id,item)}
    return Array.from(latest.values());
  }, [workspace.leads]);
  const now = Date.now();

  return (
    <Screen>
      <Title>Messages</Title>
      <Muted>Texts and emails with your Pacifica contacts, newest first.</Muted>
      <Card style={{ padding: 6, gap: 0 }}>
        {items.length ? items.map((item, index) => {
          const comm = item.communication;
          const body = String(comm.body || comm.text || comm.subject || "Message");
          const inbound = String(comm.direction || "").toLowerCase().includes("in");
          const email = comm.channel === "email";
          return (
            <Pressable
              key={`${item.lead.id}-${String(comm.id || comm.providerId || index)}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.lead.name}: ${inbound ? "" : "You: "}${body}`}
              onPress={() => router.push(comm.channel==="sms"?`/conversation/${item.lead.id}`:`/lead/${item.lead.id}`)}
              android_ripple={ripple}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed && Platform.OS === "ios" ? p.cardHigh : "transparent" }]}
            >
              <Avatar name={item.lead.name || "?"} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.top}>
                  <Text numberOfLines={1} style={[styles.name, { color: p.text, fontWeight: inbound ? "700" : "500" }]}>{item.lead.name}</Text>
                  <Text style={[styles.time, { color: inbound ? p.text : p.muted, fontWeight: inbound ? "700" : "400" }]}>{shortTime(item.time, now)}</Text>
                </View>
                <View style={styles.top}>
                  {email ? <Icon name="email-outline" color={p.muted} size={15} /> : null}
                  <Text style={[styles.body, { color: inbound ? p.text : p.muted }]} numberOfLines={2}>{inbound ? "" : "You: "}{body}</Text>
                </View>
              </View>
            </Pressable>
          );
        }) : <View style={styles.empty}><Muted>No messages yet. New replies appear here after they sync to your CRM.</Muted></View>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 18, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flex: 1, fontSize: 16 },
  time: { fontSize: 12 },
  body: { flex: 1, fontSize: 14, lineHeight: 20 },
  empty: { padding: 18 },
});
