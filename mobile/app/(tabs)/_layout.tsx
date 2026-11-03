import {ScaledText as Text} from "../../src/components/Primitives";
import { Tabs } from "expo-router";
import React from "react";
import { type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {usePalette} from "../../src/components/Primitives";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

function Icon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ color, fontWeight: "900", fontSize: 17 }}>{symbol}</Text>;
}

export default function TabLayout() {
  const p=usePalette();
  const insets = useSafeAreaInsets();
  const { unreadMessages } = useWorkspace();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.green,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: {
          backgroundColor: p.bg,
          borderTopWidth:0,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: ({ color }) => <Icon symbol="●" color={color} /> }} />
      <Tabs.Screen name="ai" options={{ href: null }} />
      <Tabs.Screen name="dialer" options={{ title: "Calls", tabBarIcon: ({ color }) => <Icon symbol="☎" color={color} /> }} />
      <Tabs.Screen name="inbox" options={{ title: "Messages", tabBarBadge: unreadMessages || undefined, tabBarIcon: ({ color }) => <Icon symbol="✉" color={color} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color }) => <Icon symbol="◎" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <Icon symbol="•••" color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );
}
