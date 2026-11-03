import {ScaledText as Text} from "../src/components/Primitives";
import { useAuth } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, View } from "react-native";
import { Screen } from "../src/components/Screen";
import { Button, Card, Muted, Title, usePalette } from "../src/components/Primitives";

export default function EntryScreen() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const [authOpen, setAuthOpen] = useState(false);
  const p = usePalette();

  if (!isLoaded) {
    return <View style={[styles.loading, { backgroundColor: p.bg }]}><ActivityIndicator size="large" color={p.green} /></View>;
  }
  if (isSignedIn) return <Redirect href="/(tabs)" />;

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.brand}>
        <Image source={require("../assets/pacifica-mark.png")} style={[styles.logo,{tintColor:p.text}]} accessibilityLabel="Pacifica" />
        <Title eyebrow="PACIFICA CRM">Your sales desk, in your pocket.</Title>
        <Muted>Leads, follow-ups, messages, contact details and Drive Mode using the same Pacifica workspace as the web CRM.</Muted>
      </View>
      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: p.text }]}>One account. Same data.</Text>
        <Muted>Sign in with the Clerk account you already use on Pacifica. The mobile app does not create a second CRM database.</Muted>
        <Button title="Sign in to Pacifica" onPress={() => setAuthOpen(true)} />
      </Card>
      <Modal visible={authOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAuthOpen(false)}>
        <AuthView onDismiss={() => setAuthOpen(false)} />
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flexGrow: 1, justifyContent: "center", gap: 28 },
  brand: { gap: 12 },
  logo: { width: 64, height: 64, marginBottom: 6, resizeMode:"contain" },
  card: { gap: 14 },
  cardTitle: { fontSize: 18, fontWeight: "900" },
});
