import {ScaledText as Text} from "../../src/components/Primitives";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {useNativeVoice} from '../../src/state/NativeVoiceProvider';
import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { AppTextInput as TextInput } from "../../src/components/AppText";
import * as Haptics from "expo-haptics";
import { Screen } from "../../src/components/Screen";
import { Button, Card, Icon, IconButton, Muted, Title, usePalette, useDisplayScale } from "../../src/components/Primitives";
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
  const keySize = Math.round(Math.max(60, 72 * scale));

  async function open(url: string) {
    if (!normalized) return;
    try {
      await openDeviceAction(url, Linking.openURL);
    } catch {
      Alert.alert("Unavailable", "This device could not open the phone service.");
    }
  }
  function call() {
    if (voice.available) void voice.call(normalized).catch(error=>Alert.alert("Call unavailable",String(error.message||error)));
    else void open(phoneCallUrl(normalized));
  }
  function text() {
    if (match) router.push(`/conversation/${match.id}`);
    else if (voice.available) Alert.alert("Save this contact first", "Add this number in Contacts to text from your Pacifica business line.");
    else void open(textMessageUrl(normalized));
  }

  return (
    <Screen>
      <Title>Calls</Title>
      {voice.available&&<Card style={styles.line}>
        <View style={[styles.lineIcon,{backgroundColor:voice.status==="ready"?p.green:p.cardHigh}]}><Icon name={voice.status==="ready"?"phone-in-talk":"phone-off-outline"} color={voice.status==="ready"?p.onGreen:p.muted} size={20}/></View>
        <View style={{flex:1,gap:2}}><Text style={{color:p.text,fontWeight:"700",fontSize:16}}>Pacifica business line</Text><Muted>{voice.notice}</Muted></View>
        <Button compact kind={voice.status==="ready"?"tonal":"primary"} title={voice.status==="ready"?"Pause":voice.status==="starting"?"Connecting…":"Turn on"} disabled={voice.status==="starting"||voice.busy} onPress={()=>void (voice.status==="ready"?voice.disable():voice.enable()).catch(error=>Alert.alert("Native calls",String(error.message||error)))}/>
      </Card>}
      {liveCall ? <Card style={[styles.line, { borderWidth: 1.5, borderColor: p.green }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.liveEyebrow, { color: p.green }]}>{liveCall.status === "connected" ? "Live on Pacifica web" : "Calling on Pacifica web"}</Text>
          <Text style={[styles.liveName, { color: p.text }]}>{liveCall.name}</Text>
          <Muted>{liveCall.phone}</Muted>
        </View>
        <Button title="Open" kind="tonal" compact onPress={() => { setNumber(liveCall.phone); if (liveCall.leadId) router.push(`/lead/${liveCall.leadId}`); }} />
      </Card> : null}

      <View style={styles.display}>
        <TextInput
          value={number}
          onChangeText={setNumber}
          keyboardType="phone-pad"
          placeholder="Enter a number"
          placeholderTextColor={p.muted}
          accessibilityLabel="Phone number"
          style={[styles.number, { color: p.text, fontSize: (number.length > 13 ? 26 : 32) * scale }]}
        />
        <Text style={[styles.match, { color: p.green }]}>{match ? match.name : " "}</Text>
      </View>

      <View style={styles.pad}>
        {keys.map((key,index) => (
          <View key={key} style={styles.keyCell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={key}
              onPress={() => { void Haptics.selectionAsync(); setNumber(value => value + key); }}
              onLongPress={key === "0" ? () => setNumber(value => value + "+") : undefined}
              style={({ pressed }) => [styles.key, { width: keySize, height: keySize, borderRadius: keySize / 2, backgroundColor: pressed ? p.greenSoft : p.cardHigh }]}
            >
              <Text style={[styles.keyText, { color: p.text }]}>{key}</Text>
              {letters[index] ? <Text style={{color:p.muted,fontSize:10,fontWeight:"600",letterSpacing:1}}>{letters[index]}</Text> : null}
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <View style={styles.side}><IconButton icon="message-text-outline" label="Text this number" size={52} disabled={!normalized} onPress={text} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Call" disabled={!normalized} onPress={call}
          style={({ pressed }) => [styles.callButton, { width: keySize + 8, height: keySize + 8, borderRadius: (keySize + 8) / 2, opacity: !normalized ? .45 : pressed ? .85 : 1 }]}>
          <Icon name="phone" color="#FFFFFF" size={30} />
        </Pressable>
        <View style={styles.side}><IconButton icon="backspace-outline" label="Delete" size={52} disabled={!number} onPress={() => setNumber(value => value.slice(0, -1))} onLongPress={() => setNumber("")} /></View>
      </View>

      <Muted>{voice.available?"Business calls use your Pacifica number. Incoming calls need notifications on and a network connection; force-stopping the app can stop it from ringing.":"Calls and texts open your phone's own app after you confirm them. Automated Pacifica outreach uses the workspace number."}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 12 },
  lineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  liveEyebrow: { fontSize: 12, fontWeight: "700" },
  liveName: { fontSize: 18, fontWeight: "700" },
  display: { alignItems: "center", gap: 2, marginTop: 8 },
  number: { minHeight: 56, textAlign: "center", letterSpacing: 1, width: "100%" },
  match: { textAlign: "center", fontSize: 14, fontWeight: "600" },
  pad: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  keyCell: { width: "33.33%", alignItems: "center" },
  key: { alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 26, fontWeight: "500" },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 6 },
  side: { width: "33.33%", alignItems: "center" },
  callButton: { backgroundColor: "#1E8E3E", alignItems: "center", justifyContent: "center" },
});
