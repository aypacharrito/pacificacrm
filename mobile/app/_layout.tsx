import {NativeVoiceProvider} from '../src/state/NativeVoiceProvider';
import {usePalette} from "../src/components/Primitives";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { WorkspaceProvider } from "../src/state/WorkspaceProvider";
import { colors } from "../src/lib/theme";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function MissingConfiguration() {
  return (
    <View style={styles.config}>
      <Image source={require("../assets/pacifica-mark.png")} style={styles.logo} accessibilityLabel="Pacifica" />
      <Text style={styles.title}>Pacifica mobile is installed.</Text>
      <Text style={styles.body}>Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in Expo/EAS environment variables, then rebuild the development app.</Text>
    </View>
  );
}

function ThemedStatusBar(){const p=usePalette();return <StatusBar style={p.dark?"light":"dark"}/>}
function AppStack() {
  return (
    <WorkspaceProvider><NativeVoiceProvider>
      <ThemedStatusBar/>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lead/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="drive/index" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </NativeVoiceProvider></WorkspaceProvider>
  );
}

export default function RootLayout() {
  if (!publishableKey) return <MissingConfiguration />;
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppStack />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  config: { flex: 1, backgroundColor: "#F7FAF9", alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  logo: { width: 72, height: 72, resizeMode:"contain" },
  title: { fontSize: 24, fontWeight: "900", color: colors.text, textAlign: "center" },
  body: { maxWidth: 420, color: colors.muted, textAlign: "center", lineHeight: 21 },
});
