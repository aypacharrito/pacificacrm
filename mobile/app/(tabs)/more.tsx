import {ScaledText as Text} from "../../src/components/Primitives";
import { useClerk, useUser } from "@clerk/expo";
import { router } from "expo-router";
import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Avatar, Card, Chip, ListItem, Muted, Pill, SectionTitle, Title, usePalette } from "../../src/components/Primitives";
import * as Application from "expo-application";
import { API_URL } from "../../src/lib/api";
import { useWorkspace } from "../../src/state/WorkspaceProvider";
import DisplaySizeSlider from "../../src/components/DisplaySizeSlider";

const PALETTES: Array<[string, string]> = [["system","Follow device"],["blue","Blue"],["teal","Teal"],["violet","Violet"],["rose","Rose"],["amber","Amber"],["slate","Graphite"]];

export default function MoreScreen() {
  const p = usePalette();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { workspace, syncing, offline, refresh, updateProfile } = useWorkspace();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Pacifica user";

  return (
    <Screen>
      <Title>More</Title>
      <Card style={styles.profile}>
        <Avatar name={name} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[styles.name, { color: p.text }]}>{name}</Text>
          <Muted numberOfLines={1}>{user?.primaryEmailAddress?.emailAddress || ""}</Muted>
        </View>
        <Pill active={offline}>{syncing ? "Syncing" : offline ? "Offline" : "Synced"}</Pill>
      </Card>

      <Card style={{ padding: 0, paddingVertical: 6, gap: 0 }}>
        <ListItem icon="creation" title="Pacifica AI" subtitle="Photo to contact, and questions about your CRM" onPress={() => router.push("/ai")} />
        <ListItem icon="calendar-month-outline" title="Calendar" subtitle="Appointments, payments and phone reminders" onPress={() => router.push("/calendar")} />
        <ListItem icon="car-outline" title="Drive Mode" subtitle="A simple prioritized calling queue" onPress={() => router.push("/drive")} />
        <ListItem icon="sync" title="Sync now" subtitle={`Connected to ${API_URL.replace(/^https?:\/\//, "")}`} onPress={() => void refresh()} right={<View />} />
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card style={{ gap: 14 }}>
        <View style={styles.chips}>{([["system","Follow device"],["light","Light"],["dark","Dark"]] as const).map(([appearance,label])=><Chip key={appearance} label={label} selected={(workspace.profile.appearance||"system")===appearance} onPress={()=>void updateProfile({appearance})}/>)}</View>
        <Text style={[styles.label, { color: p.muted }]}>Accent color</Text>
        <View style={styles.chips}>{PALETTES.map(([colorPalette,label])=><Chip key={colorPalette} label={label} selected={(workspace.profile.colorPalette||"system")===colorPalette} onPress={()=>void updateProfile({colorPalette})}/>)}</View>
        <DisplaySizeSlider/>
      </Card>

      <Card style={{ padding: 0, paddingVertical: 6, gap: 0 }}>
        <ListItem icon="logout" title="Sign out" danger
          subtitle="Data saved on this phone stays until the app is removed or another account signs in."
          onPress={() => Alert.alert("Sign out of Pacifica?", "You can sign back in with the same account.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void signOut() }])}
          right={<View />} />
      </Card>
      <Text accessibilityLabel="Pacifica app version" style={{color:p.muted,fontSize:12,textAlign:"center"}}>Pacifica {Application.nativeApplicationVersion||"1.1.0"} · Build {Application.nativeBuildVersion||"preview"}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontWeight: "700", fontSize: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 13, fontWeight: "600" },
});
