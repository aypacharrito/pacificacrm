import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Muted, SearchField, Title, usePalette } from "../../src/components/Primitives";
import { LeadRow } from "../../src/components/LeadRow";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

export default function ContactsScreen() {
  const p = usePalette();
  const { workspace, loading, syncing, offline, error, refresh } = useWorkspace();
  const [query, setQuery] = useState("");
  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.leads
      .filter(lead => !lead.deletedAt && (!q || `${lead.name} ${lead.phone} ${lead.email} ${lead.address} ${lead.city}`.toLowerCase().includes(q)))
      .sort((a,b) => (a.name || "").localeCompare(b.name || "") || a.id - b.id);
  }, [workspace.leads, query]);
  return (
    <Screen scroll={false}>
      <FlatList
        data={leads}
        keyExtractor={lead => String(lead.id)}
        renderItem={({ item }) => <LeadRow lead={item} tile />}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshing={syncing}
        onRefresh={() => void refresh()}
        ListHeaderComponent={<View style={styles.header}>
          <Title>Contacts</Title>
          <SearchField accessibilityLabel="Search contacts" value={query} onChangeText={setQuery} placeholder="Search contacts" />
          <View style={{ paddingHorizontal: 6 }}>
            <Muted>{loading ? "Loading contacts…" : `${leads.length} contacts`}{offline ? " · Offline" : ""}</Muted>
            {error ? <Muted>{error}</Muted> : null}
          </View>
        </View>}
        ListEmptyComponent={<View style={[styles.empty, { backgroundColor: p.card }]}><Muted>{loading ? "Loading your workspace…" : "No contacts found."}</Muted></View>}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  header: { gap: 14, marginBottom: 12 },
  empty: { padding: 20, borderRadius: 20 },
});
