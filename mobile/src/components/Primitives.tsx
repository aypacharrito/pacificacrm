import React, {useSyncExternalStore} from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../lib/theme";
import { useWorkspace } from "../state/WorkspaceProvider";

let previewScale:number|null=null;
const scaleListeners=new Set<()=>void>();
export function previewDisplayScale(value:number|null) {previewScale=value;scaleListeners.forEach(listener=>listener())}
const subscribeScale=(listener:()=>void)=>{scaleListeners.add(listener);return ()=>{scaleListeners.delete(listener)}};
export function savedDisplayScale(profile:Record<string,unknown>) {
  const value=profile.displayScale;
  return typeof value==="number"&&Number.isFinite(value)?Math.min(125,Math.max(80,Math.round(value/5)*5)):profile.displaySize==="extra-large"?115:profile.displaySize==="comfortable"?85:90;
}
export function useDisplayScale() {
  const { workspace } = useWorkspace();
  const preview=useSyncExternalStore(subscribeScale,()=>previewScale,()=>null);
  return (preview??savedDisplayScale(workspace.profile))/100;
}

export function ScaledText({style,...props}:TextProps) {
  const scale=useDisplayScale(), flat=StyleSheet.flatten(style)||{};
  return <Text {...props} style={[style,{fontSize:(typeof flat.fontSize==="number"?flat.fontSize:14)*scale,...(typeof flat.lineHeight==="number"?{lineHeight:flat.lineHeight*scale}:{})}]}/>;
}

export function usePalette() {
  const scheme=useColorScheme();
  const {workspace}=useWorkspace();
  const dark=workspace.profile.appearance==="dark"||(workspace.profile.appearance!=="light"&&scheme==="dark");
  const palette=String(workspace.profile.colorPalette||'system');
  const accents:Record<string,{light:string;dark:string;soft:string}>={blue:{light:'#305c9c',dark:'#aac4ff',soft:'#243651'},teal:{light:'#14685f',dark:'#8bd8c8',soft:'#183b37'},violet:{light:'#6842a3',dark:'#c9afff',soft:'#302441'},rose:{light:'#9a385e',dark:'#f1acc7',soft:'#402633'},amber:{light:'#805715',dark:'#e9c382',soft:'#3d3220'},slate:{light:'#4d5b70',dark:'#c0c9d7',soft:'#29313b'}};
  const selected=accents[palette]||accents.blue!;
  const devicePalette=palette==='system'&&Platform.OS==='android'&&Number(Platform.Version)>=31;
  return {
    dark,
    bg: dark ? colors.darkBg : colors.bg,
    card: dark ? colors.darkCard : colors.card,
    text: dark ? colors.darkText : colors.text,
    muted: dark ? colors.darkMuted : colors.muted,
    border: dark ? colors.darkBorder : colors.border,
    green:devicePalette?PlatformColor(dark?'@android:color/system_accent1_200':'@android:color/system_accent1_700'):dark?selected.dark:selected.light,
    greenSoft:devicePalette?PlatformColor(dark?'@android:color/system_accent1_900':'@android:color/system_accent1_50'):dark?selected.soft:colors.greenSoft,
    danger: colors.danger,
    warning: colors.warning,
  };
}

export function Title({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <View style={{ gap: 4 }}>
    {eyebrow ? <Text style={[styles.eyebrow, { color: p.green, fontSize: 11 * scale }]}>{eyebrow}</Text> : null}
    <View style={{flexDirection:"row",alignItems:"center",gap:10}}><Image source={require("../../assets/pacifica-mark.png")} style={{width:28,height:28,tintColor:p.text,resizeMode:"contain"}}/><Text style={[styles.title, { color: p.text, fontSize: 26 * scale, lineHeight: 32 * scale,flexShrink:1 }]}>{children}</Text></View>
  </View>;
}

export function Muted({ children, numberOfLines }: { children: React.ReactNode; numberOfLines?: number }) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <Text numberOfLines={numberOfLines} style={[styles.muted, { color: p.muted, fontSize: 14 * scale, lineHeight: 20 * scale }]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const p = usePalette();
  const scale=useDisplayScale();
  return <View style={[styles.card, { backgroundColor: "transparent", padding:12*scale }, style]}>{children}</View>;
}

export function Button({
  title,
  kind = "primary",
  loading,
  ...props
}: PressableProps & { title: string; kind?: "primary" | "secondary" | "danger"; loading?: boolean }) {
  const p = usePalette();
  const scale = useDisplayScale();
  const backgroundColor = kind === "primary" ? p.green : kind === "danger" ? colors.danger : "transparent";
  const textColor = kind === "secondary" ? p.text : kind === "primary" && p.dark ? colors.darkBg : "#FFFFFF";
  return (
    <Pressable
      {...props}
      onPress={event => {
        void Haptics.selectionAsync();
        props.onPress?.(event);
      }}
      disabled={props.disabled || loading}
      style={state => [
        styles.button,
        { backgroundColor, paddingHorizontal:14*scale, opacity: props.disabled ? .5 : 1, transform: [{ scale: state.pressed ? .975 : 1 }] },
        typeof props.style === "function" ? props.style(state) : props.style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.buttonText, { color: textColor, fontSize: 15 * scale }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const p = usePalette();
  const scale = useDisplayScale();
  const flat=StyleSheet.flatten(props.style)||{};
  return <TextInput
    placeholderTextColor={p.muted}
    {...props}
    style={[styles.field, { backgroundColor: p.card, color: p.text }, props.style,{fontSize:(typeof flat.fontSize==="number"?flat.fontSize:15)*scale,...(typeof flat.lineHeight==="number"?{lineHeight:flat.lineHeight*scale}:{})}]}
  />;
}

export function Pill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  const p = usePalette();
  const scale=useDisplayScale();
  return <View style={[styles.pill, { backgroundColor: active ? p.greenSoft : p.card, borderColor: active ? p.green : p.border }]}>
    <Text style={{ color: active ? p.green : p.muted, fontWeight: "700", fontSize: 12*scale }}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, fontFamily: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium" }) },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.9, fontFamily: Platform.select({ ios: "Avenir Next", android: "sans-serif" }) },
  muted: { fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 0, borderRadius: 0, padding: 12 },
  button: { minHeight: 48, paddingHorizontal: 14, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 0 },
  buttonText: { fontSize: 15, fontWeight: "800", fontFamily: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium" }) },
  field: { minHeight: 48, borderWidth: 0, borderRadius: 6, paddingHorizontal: 12, fontSize: 15 },
  pill: { borderWidth: 0, borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8 },
});
