import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, usePalette, type IconName } from "../../src/components/Primitives";
import { useWorkspace } from "../../src/state/WorkspaceProvider";

/** Material 3 navigation item: outlined icon, filled icon inside a soft pill when selected (like Android's Phone app). */
function TabIcon({ focused, icon, filled }: { focused: boolean; icon: IconName; filled: IconName }) {
  const p = usePalette();
  return <View style={{ width: 60, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: focused ? p.greenSoft : "transparent" }}>
    <Icon name={focused ? filled : icon} color={focused ? p.green : p.muted} size={22} />
  </View>;
}

export default function TabLayout() {
  const p=usePalette();
  const insets = useSafeAreaInsets();
  const { unreadMessages } = useWorkspace();
  const tab = (title: string, icon: IconName, filled: IconName) => ({
    title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} icon={icon} filled={filled} />,
  });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "shift",  // tabs slide and fade like Android's own apps
        sceneStyle: { backgroundColor: p.bg },
        tabBarActiveTintColor: p.text,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: {
          backgroundColor: p.card,
          borderTopWidth:0,
          elevation: 0,
          height: 68 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 12, marginTop: 2 },
        tabBarBadgeStyle: { backgroundColor: p.danger, color: p.dark ? "#3B0A06" : "#FFFFFF", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={tab("Today", "home-variant-outline", "home-variant")} />
      <Tabs.Screen name="ai" options={{ href: null }} />
      <Tabs.Screen name="dialer" options={tab("Calls", "phone-outline", "phone")} />
      <Tabs.Screen name="inbox" options={{ ...tab("Messages", "message-text-outline", "message-text"), tabBarBadge: unreadMessages || undefined }} />
      <Tabs.Screen name="contacts" options={tab("Contacts", "account-multiple-outline", "account-multiple")} />
      <Tabs.Screen name="more" options={tab("More", "dots-horizontal-circle-outline", "dots-horizontal-circle")} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );
}
