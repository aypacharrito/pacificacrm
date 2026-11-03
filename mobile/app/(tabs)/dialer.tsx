import {ScaledText as Text} from "../../src/components/Primitives";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {useNativeVoice} from '../../src/state/NativeVoiceProvider';
import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { Button, Card, Field, Muted, Title, usePalette, useDisplayScale } from "../../src/components/Primitives";
import type { LiveCallSession } from "../../src/lib/types";
import { openDeviceAction, phoneCallUrl, textMessageUrl } from "../../src/lib/device-actions";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const letters=["","ABC","DEF","GHI","JKL","MNO","PQRS","TUV","WXYZ","","+",""];

export default function DialerScreen() {
  const voice=useNativeVoice();
  const p = usePalette();
  const scale=useDisplayScale();
  const { workspace } = useWorkspace();
  const liveCall = (workspace.profile.liveCallSession || null) as LiveCallSession | null;
  const [number, setNumber] = useState("");
  const normalized = number.replace(/[^+\d]/g, "");
  const match = useMemo(() => {
    const digits = normalized.replace(/\D/g, "").slice(-10);
    return workspace.leads.find(lead => lead.phone.replace(/\D/g, "").slice(-10) === digits);
  }, [normalized, workspace.leads]);

  async function open(url: string) {
    if (!normalized) return;
    try {
      await openDeviceAction(url, Linking.openURL);
    } catch {
      Alert.alert("Unavailable", "This device could not open the phone service.");
    }
  }

  return (
    <Screen>
      <Title eyebrow="PACIFICA">Dialer</Title>{voice.available&&<Card><Text style={{color:p.text,fontWeight:"700"}}>Your Pacifica business line</Text><Muted>{voice.notice}</Muted><Button title={voice.status==="ready"?"Pause incoming calls":voice.status==="starting"?"Connecting…":"Enable incoming calls"} disabled={voice.status==="starting"||voice.busy} onPress={()=>void (voice.status==="ready"?voice.disable():voice.enable()).catch(error=>Alert.alert("Native calls",String(error.message||error)))}/></Card>}
      {liveCall ? <Card style={[styles.liveCall, { borderColor: p.green }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.liveEyebrow, { color: p.green }]}>{liveCall.status === "connected" ? "LIVE ON PACIFICA WEB" : "CALLING ON PACIFICA WEB"}</Text>
          <Text style={[styles.liveName, { color: p.text }]}>{liveCall.name}</Text>
          <Muted>{liveCall.phone}</Muted>
        </View>
        <Button title="Open" kind="secondary" onPress={() => { setNumber(liveCall.phone); if (liveCall.leadId) router.push(`/lead/${liveCall.leadId}`); }} />
      </Card> : null}
      <Card style={styles.card}>
        <Field
          value={number}
          onChangeText={setNumber}
          keyboardType="phone-pad"
          placeholder="Enter a number"
          style={styles.number}
        />
        {match ? <Text style={[styles.match, { color: p.green }]}>{match.name}</Text> : null}
        <View style={styles.pad}>
          {keys.map((key,index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={key}
              key={key}
              onPress={() => setNumber(value => value + key)}
              style={({ pressed }) => [styles.key, { minHeight:Math.max(48,52*scale), backgroundColor: pressed?p.greenSoft:"transparent" }]}
            >
              <Text style={[styles.keyText, { color: p.text }]}>{key}</Text>
              <Text style={{color:p.muted,fontSize:10,fontWeight:"600",minHeight:12}}>{letters[index]}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Button title="⌫" kind="secondary" onPress={() => setNumber(value => value.slice(0, -1))} style={{ flex: 1 }} />
          <Button title="Call" onPress={() => voice.available?void voice.call(normalized).catch(error=>Alert.alert("Call unavailable",String(error.message||error))):void open(phoneCallUrl(normalized))} disabled={!normalized} style={{ flex: 2 }} />
          <Button title="Text" kind="secondary" onPress={() => {if(match)router.push(`/conversation/${match.id}`);else if(voice.available)Alert.alert("Save this contact first", "Add this number in Contacts to text from your Pacifica business line.");else void open(textMessageUrl(normalized));}} disabled={!normalized} style={{ flex: 1 }} />
        </View>
      </Card>
      <Muted>{voice.available?"Business calls use your Pacifica number. Incoming calls require notifications, a network connection and completed Firebase setup. Android force-stop, disabled notifications or a disconnected phone can prevent ringing.":"Calls and texts opened here use your phone’s native service after you confirm them. Automated Pacifica outreach uses the workspace number."}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  liveCall: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5 },
  liveEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  liveName: { fontSize: 18, fontWeight: "900" },
  card: { gap: 14 },
  number: { minHeight: 58, fontSize: 23, textAlign: "center", letterSpacing: 1 },
  match: { textAlign: "center", fontSize: 14, fontWeight: "800" },
  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  key: { width: "30%", minHeight:48, paddingVertical:5, borderWidth: 0, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 22, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8 },
});
