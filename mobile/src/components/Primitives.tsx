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
  type ColorValue,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { colors } from "../lib/theme";
import { avatarColor, initial } from "../lib/format";
import { useWorkspace } from "../state/WorkspaceProvider";

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

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
    cardHigh: dark ? colors.darkCardHigh : colors.cardHigh,
    text: dark ? colors.darkText : colors.text,
    muted: dark ? colors.darkMuted : colors.muted,
    border: dark ? colors.darkBorder : colors.border,
    green:devicePalette?PlatformColor(dark?'@android:color/system_accent1_200':'@android:color/system_accent1_700'):dark?selected.dark:selected.light,
    greenSoft:devicePalette?PlatformColor(dark?'@android:color/system_accent1_900':'@android:color/system_accent1_50'):dark?selected.soft:colors.greenSoft,
    // Text/icons drawn on top of the accent color.
    onGreen: dark ? colors.darkBg : "#FFFFFF",
    danger: dark ? colors.darkDanger : colors.danger,
    warning: colors.warning,
  };
}

/** Material icon (vector, follows the text color) — never an emoji, which Android paints in its own colors. */
export function Icon({ name, color, size = 22 }: { name: IconName; color: ColorValue; size?: number }) {
  const scale = useDisplayScale();
  return <MaterialCommunityIcons name={name} color={color as string} size={Math.round(size * Math.max(.9, scale))} />;
}

export function Title({ children }: { children: React.ReactNode; eyebrow?: string }) {
  // `eyebrow` is still accepted (older screens pass it) but no longer drawn: Android's own apps use one clean heading.
  const p = usePalette();
  const scale = useDisplayScale();
  return <View style={{flexDirection:"row",alignItems:"center",gap:10*scale,paddingTop:4}}>
    <Image source={require("../../assets/pacifica-mark.png")} style={{width:26*scale,height:26*scale,tintColor:p.green,resizeMode:"contain"}}/>
    <Text style={[styles.title, { color: p.text, fontSize: 28 * scale, lineHeight: 34 * scale,flexShrink:1 }]}>{children}</Text>
  </View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <View style={{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:4,marginTop:6}}>
    <Text style={{color:p.text,fontSize:17*scale,fontWeight:"700",flex:1}}>{children}</Text>{right}
  </View>;
}

export function Muted({ children, numberOfLines }: { children: React.ReactNode; numberOfLines?: number }) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <Text numberOfLines={numberOfLines} style={[styles.muted, { color: p.muted, fontSize: 14 * scale, lineHeight: 20 * scale }]}>{children}</Text>;
}

/** A raised rounded surface, like the grouped blocks in Android's Contacts and Settings. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const scale=useDisplayScale();
  return <View style={[styles.card, { backgroundColor: p.card, padding:16*scale, gap:10*scale }, style]}>{children}</View>;
}

type ButtonKind = "primary" | "secondary" | "tonal" | "text" | "danger";
export function Button({
  title,
  kind = "primary",
  loading,
  icon,
  compact,
  ...props
}: PressableProps & { title: string; kind?: ButtonKind; loading?: boolean; icon?: IconName; compact?: boolean }) {
  const p = usePalette();
  const scale = useDisplayScale();
  // secondary = tonal: a soft filled pill. "text" is for low-emphasis actions (Tomorrow, Reset).
  const backgroundColor = kind === "primary" ? p.green : kind === "danger" ? "transparent" : kind === "text" ? "transparent" : p.greenSoft;
  const textColor = kind === "primary" ? p.onGreen : kind === "danger" ? p.danger : p.green;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      onPress={event => {
        void Haptics.selectionAsync();
        props.onPress?.(event);
      }}
      disabled={props.disabled || loading}
      style={state => [
        styles.button,
        { backgroundColor, minHeight:(compact?40:48)*Math.max(.9,scale), paddingHorizontal:(kind==="text"?12:18)*scale, opacity: props.disabled ? .45 : state.pressed ? .8 : 1,
          borderWidth: kind === "danger" ? 1 : 0, borderColor: p.danger },
        typeof props.style === "function" ? props.style(state) : props.style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <View style={styles.buttonInner}>
        {icon ? <Icon name={icon} color={textColor} size={18} /> : null}
        <Text numberOfLines={1} style={[styles.buttonText, { color: textColor, fontSize: 15 * scale }]}>{title}</Text>
      </View>}
    </Pressable>
  );
}

export function IconButton({ icon, label, color, background, size = 44, ...props }: PressableProps & { icon: IconName; label: string; color?: ColorValue; background?: ColorValue; size?: number }) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} {...props}
    style={state => [{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center",
      backgroundColor: state.pressed ? p.cardHigh : background || "transparent", opacity: props.disabled ? .45 : 1 },
      typeof props.style === "function" ? props.style(state) : props.style]}>
    <Icon name={icon} color={color || p.text} size={Math.round(size * .5)} />
  </Pressable>;
}

export function Field(props: TextInputProps) {
  const p = usePalette();
  const scale = useDisplayScale();
  const flat=StyleSheet.flatten(props.style)||{};
  return <TextInput
    placeholderTextColor={p.muted}
    {...props}
    style={[styles.field, { backgroundColor: p.cardHigh, color: p.text }, props.style,{fontSize:(typeof flat.fontSize==="number"?flat.fontSize:15)*scale,...(typeof flat.lineHeight==="number"?{lineHeight:flat.lineHeight*scale}:{})}]}
  />;
}

/** Rounded search bar with a magnifier, like "Buscar contactos". */
export function SearchField(props: TextInputProps) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <View style={[styles.search, { backgroundColor: p.card, minHeight: 54 * Math.max(.9, scale) }]}>
    <Icon name="magnify" color={p.muted} />
    <TextInput placeholderTextColor={p.muted} {...props} style={[{ flex: 1, color: p.text, fontSize: 16 * scale, paddingVertical: 10 }, props.style]} />
    {props.value ? <IconButton icon="close" label="Clear search" size={36} color={p.muted} onPress={() => props.onChangeText?.("")} /> : null}
  </View>;
}

export function Pill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  const p = usePalette();
  const scale=useDisplayScale();
  return <View style={[styles.pill, { backgroundColor: active ? p.greenSoft : p.cardHigh }]}>
    <Text style={{ color: active ? p.green : p.muted, fontWeight: "700", fontSize: 12*scale }}>{children}</Text>
  </View>;
}

/** Filter chip (Today / Later / Done, appearance choices). Padding leaves room so Android never clips the label. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { void Haptics.selectionAsync(); onPress(); }}
    style={({ pressed }) => [styles.chip, { minHeight: 38 * Math.max(.9, scale), paddingHorizontal: 14 * scale,
      backgroundColor: selected ? p.greenSoft : "transparent", borderColor: selected ? p.greenSoft : p.border, opacity: pressed ? .8 : 1 }]}>
    {selected ? <Icon name="check" color={p.green} size={16} /> : icon ? <Icon name={icon} color={p.muted} size={16} /> : null}
    <Text style={{ color: selected ? p.green : p.text, fontWeight: "600", fontSize: 14 * scale }}>{label}</Text>
  </Pressable>;
}

/** Colored circle with the first letter, like Android's contact avatars. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const scale = useDisplayScale();
  const box = Math.round(size * Math.max(.9, scale));
  return <View style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: avatarColor(name), alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: "#FFFFFF", fontSize: box * .42, fontWeight: "600" }}>{initial(name)}</Text>
  </View>;
}

/** A settings-style row: icon, title, subtitle, chevron. */
export function ListItem({ icon, title, subtitle, onPress, right, danger }: { icon: IconName; title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean }) {
  const p = usePalette();
  const scale = useDisplayScale();
  return <Pressable accessibilityRole={onPress ? "button" : undefined} disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [styles.listItem, { paddingVertical: 12 * scale, backgroundColor: pressed ? p.cardHigh : "transparent" }]}>
    <View style={[styles.listIcon, { backgroundColor: danger ? "transparent" : p.greenSoft }]}><Icon name={icon} color={danger ? p.danger : p.green} size={20} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: danger ? p.danger : p.text, fontSize: 16 * scale, fontWeight: "600" }}>{title}</Text>
      {subtitle ? <Text style={{ color: p.muted, fontSize: 13 * scale, lineHeight: 18 * scale }}>{subtitle}</Text> : null}
    </View>
    {right ?? (onPress ? <Icon name="chevron-right" color={p.muted} /> : null)}
  </Pressable>;
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.4, fontFamily: Platform.select({ ios: "Avenir Next", android: "sans-serif" }) },
  muted: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 24, padding: 16, overflow: "hidden" },
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { fontSize: 15, fontWeight: "700", fontFamily: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium" }) },
  field: { minHeight: 50, borderWidth: 0, borderRadius: 16, paddingHorizontal: 16, fontSize: 15 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 999, paddingLeft: 18, paddingRight: 8 },
  pill: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1 },
  listItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16 },
  listIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
