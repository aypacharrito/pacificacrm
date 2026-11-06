import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { AppText as Text } from "./AppText";
import type { Lead } from "../lib/types";
import { displayStage, formatPhone, isHotLead, leadSubtitle } from "../lib/lead";
import { Avatar, Icon, Pill, useDisplayScale, usePalette, useRipple } from "./Primitives";

/** One contact. `tile` = its own rounded block (Contacts list); otherwise a plain row inside a Card. */
export function LeadRow({ lead, tile = false }: { lead: Lead; tile?: boolean }) {
  const p = usePalette();
  const scale = useDisplayScale();
  const ripple = useRipple();
  const meta = [lead.lastCallResult ? `Last call: ${lead.lastCallResult}` : "", leadSubtitle(lead) || displayStage(lead)].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lead.name || "Unnamed lead"}, ${formatPhone(lead.phone)}`}
      onPress={() => router.push(`/lead/${lead.id}`)}
      android_ripple={ripple}
      style={({ pressed }) => [styles.row, tile && styles.tile, {
        paddingVertical: 12 * scale,
        backgroundColor: pressed && Platform.OS === "ios" ? p.cardHigh : tile ? p.card : "transparent",
      }]}
    >
      <Avatar name={lead.name || "?"} />
      <View style={styles.copy}>
        <View style={styles.topline}>
          <Text numberOfLines={1} style={[styles.name, { color: p.text, fontSize: 16 * scale }]}>{lead.name || "Unnamed lead"}</Text>
          {isHotLead(lead) ? <Pill active>Priority</Pill> : null}
        </View>
        <Text style={{ color: p.text, fontSize: 14 * scale }}>{formatPhone(lead.phone)}</Text>
        {meta ? <Text numberOfLines={1} style={{ color: p.muted, fontSize: 13 * scale }}>{meta}</Text> : null}
      </View>
      <Icon name="chevron-right" color={p.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, borderRadius: 18, overflow: "hidden" },
  tile: { marginBottom: 4, paddingHorizontal: 16, borderRadius: 20 },
  copy: { flex: 1, gap: 2 },
  topline: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontWeight: "600" },
});
