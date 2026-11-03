import {ScaledText as Text} from "../../src/components/Primitives";
import { useClerk, useUser } from "@clerk/expo";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Button, Card, Muted, Pill, Title, usePalette } from "../../src/components/Primitives";
import * as Application from "expo-application";
import { API_URL } from "../../src/lib/api";
import { useWorkspace } from "../../src/state/WorkspaceProvider";
import DisplaySizeSlider from "../../src/components/DisplaySizeSlider";

export default function MoreScreen() {
  const p = usePalette();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { workspace, syncing, offline, refresh, updateProfile } = useWorkspace();

  return (
    <Screen>
      <Title eyebrow="ACCOUNT">More</Title>
      <Card style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: p.greenSoft }]}>
          <Text style={{ color: p.green, fontSize: 22, fontWeight: "900" }}>{(user?.firstName || user?.primaryEmailAddress?.emailAddress || "P").slice(0,1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: p.text }]}>{user?.fullName || user?.primaryEmailAddress?.emailAddress || "Pacifica user"}</Text>
          <Muted>{user?.primaryEmailAddress?.emailAddress || ""}</Muted>
        </View>
        <Pill active={offline}>{syncing ? "Syncing" : offline ? "Offline" : "Synced"}</Pill>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Appearance</Text><View style={[styles.sizeRow,{flexWrap:'wrap'}]}>{["system","light","dark"].map(appearance=><Button key={appearance} title={appearance==='system'?'Follow device':appearance==="light"?"Light":"Dark"} kind={(workspace.profile.appearance||'system')===appearance?"primary":"secondary"} onPress={()=>void updateProfile({appearance})} style={{paddingHorizontal:10}}/>)}</View>
        <Text style={[styles.sectionTitle,{color:p.text}]}>Color palette</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{['system','blue','teal','violet','rose','amber','slate'].map(colorPalette=><Button key={colorPalette} title={colorPalette==='system'?'Follow device':colorPalette==='slate'?'Graphite':colorPalette.charAt(0).toUpperCase()+colorPalette.slice(1)} kind={(workspace.profile.colorPalette||'system')===colorPalette?'primary':'secondary'} onPress={()=>void updateProfile({colorPalette})} style={{paddingHorizontal:10}}/>)}</View>
        <DisplaySizeSlider/>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Pacifica AI</Text>
        <Muted>Your assistant for this workspace.</Muted>
        <Button title="Open Pacifica AI" kind="secondary" onPress={() => router.push("/ai")} />
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Calendar</Text>
        <Muted>Appointments, payments, and phone reminders.</Muted>
        <Button title="Open Calendar" kind="secondary" onPress={() => router.push("/calendar")} />
      </Card>



      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Drive Mode</Text>
        <Muted>Open a simple prioritized calling queue.</Muted>
        <Button title="Open Drive Mode" kind="secondary" onPress={() => router.push("/drive")} />
      </Card>

      <Card style={styles.section}>
        <Text accessibilityLabel="Pacifica app version" style={{color:p.muted,fontSize:12}}>Pacifica {Application.nativeApplicationVersion||"1.1.0"} · Build {Application.nativeBuildVersion||"preview"}</Text>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Connection</Text>
        <Muted>Backend: {API_URL}</Muted>
        <Button title="Sync now" kind="secondary" onPress={() => void refresh()} />
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>Account</Text>
        <Muted>Signing out removes the active Clerk session. Cached CRM data remains on the device until the app is removed or overwritten by another signed-in workspace.</Muted>
        <Button title="Sign out" kind="danger" onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "900", fontSize: 16 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  sizeRow: { flexDirection: "row", gap: 8 },
  sizeButton: { flex: 1, paddingHorizontal: 6 },
});
