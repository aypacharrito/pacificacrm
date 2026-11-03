import React from "react";
import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {usePalette,useDisplayScale} from "./Primitives";

export function Screen({ children, scroll = true, contentContainerStyle, ...props }: ScrollViewProps & { scroll?: boolean }) {
  const {bg:backgroundColor}=usePalette();
  const scale=useDisplayScale();
  if (!scroll) {
    return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor }]}><View style={styles.fill}>{children}</View></SafeAreaView>;
  }
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor }]}>
      <ScrollView
        {...props}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, {padding:16*scale,gap:12*scale}, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: { padding: 18, paddingBottom: Platform.OS === "ios" ? 40 : 28, gap: 14 },
});
