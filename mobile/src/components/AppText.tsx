import React from "react";
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from "react-native";

/** Inter is bundled with the app (loaded in app/_layout.tsx). Using one known font everywhere fixes Android phones
 * whose own system font makes React Native cut off the last letters of bold labels ("Reac", "Toda"), and gives the
 * app the same clean look on every phone. Android needs a separate font file per weight, so weights map to families. */
export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export function fontFor(weight: unknown): string {
  const value = weight === "bold" ? 700 : weight === "normal" || weight === undefined ? 400 : Number(weight);
  if (value >= 700) return FONT.bold;
  if (value >= 600) return FONT.semibold;
  if (value >= 500) return FONT.medium;
  return FONT.regular;
}

/** Drop-in for React Native's Text: picks the Inter file for the style's weight unless a font is set explicitly. */
export const AppText = React.forwardRef<RNText, TextProps>(function AppText({ style, ...props }, ref) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return <RNText ref={ref} {...props} style={style} />;
  return <RNText ref={ref} {...props} style={[style, { fontFamily: fontFor(flat.fontWeight), fontWeight: "normal" }]} />;
});

export const AppTextInput = React.forwardRef<RNTextInput, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  const flat = StyleSheet.flatten(style) || {};
  return <RNTextInput ref={ref} {...props} style={[style, flat.fontFamily ? null : { fontFamily: fontFor(flat.fontWeight), fontWeight: "normal" }]} />;
});
