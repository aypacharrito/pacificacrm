import {NativeVoiceProvider} from '../src/state/NativeVoiceProvider';
import {usePalette} from "../src/components/Primitives";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { KeyboardProvider } from "react-native-keyboard-controller";

void SplashScreen.preventAutoHideAsync().catch(() => {});
import { AppText as Text } from "../src/components/AppText";
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
function ThemedStack() {
  const p = usePalette();
  // Screens slide in from the right like Messages/Contacts; the themed background avoids a white flash between them.
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: p.bg } }}>
      <Stack.Screen name="index" options={{ animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="lead/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="drive/index" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
function AppStack() {
  return (
    <WorkspaceProvider><NativeVoiceProvider>
      <ThemedStatusBar/>
      <ThemedStack/>
    </NativeVoiceProvider></WorkspaceProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => { if (fontsLoaded || fontError) void SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;  // the splash screen stays up for the split second fonts take
  if (!publishableKey) return <MissingConfiguration />;
  return (
    <KeyboardProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <AppStack />
      </ClerkProvider>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  config: { flex: 1, backgroundColor: "#F7FAF9", alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  logo: { width: 72, height: 72, resizeMode:"contain" },
  title: { fontSize: 24, fontWeight: "900", color: colors.text, textAlign: "center" },
  body: { maxWidth: 420, color: colors.muted, textAlign: "center", lineHeight: 21 },
});
