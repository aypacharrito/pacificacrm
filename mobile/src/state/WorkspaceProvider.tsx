import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import {router} from "expo-router";
import {updateCalendarNotifications} from "../lib/calendar-notifications";
import { getWorkspace, putWorkspace } from "../lib/api";
import { createWorkspaceSync, emptyWorkspace, workspaceCacheKey, type Snapshot } from "../lib/workspace-sync";
import type { Lead, Workspace } from "../lib/types";

type WorkspaceContextValue = {
  workspace: Workspace;
  loading: boolean;
  syncing: boolean;
  offline: boolean;
  error: string;
  unreadMessages: number;
  calendarReminders: boolean;
  setCalendarReminders: (enabled:boolean) => Promise<void>;
  refresh: () => Promise<void>;
  markMessagesRead: () => Promise<void>;
  updateLead: (id: number, patch: Partial<Lead>) => Promise<void>;
  updateProfile: (patch: Record<string, unknown>) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function inboundItems(workspace: Workspace) {
  return workspace.leads.flatMap(lead => (Array.isArray(lead.communications) ? lead.communications : [])
    .filter(item => String(item.direction || "").toLowerCase().includes("in"))
    .map(item => ({ lead, item, time: new Date(String(item.createdAt || item.timestamp || item.at || item.sentAt || "")).getTime() || 0 })))
    .sort((a, b) => b.time - a.time);
}


export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  return <AccountWorkspaceProvider key={userId || "signed-out"} userId={userId || ""}>{children}</AccountWorkspaceProvider>;
}

function AccountWorkspaceProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const { getToken } = useAuth({ treatPendingAsSignedOut: false });
  const tokenRef = useRef(getToken);
  useEffect(() => { tokenRef.current = getToken; }, [getToken]);
  const alive = useRef(true);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(Boolean(userId));
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [calendarReminders,setCalendarEnabled]=useState(false);
  const setCalendarReminders=useCallback(async(enabled:boolean)=>{
    if(enabled){const permission=await Notifications.requestPermissionsAsync();if(permission.status!=="granted")throw Error("Allow notifications in your phone settings first.");}
    await AsyncStorage.setItem(`${workspaceCacheKey(userId)}:calendar`,enabled?'on':'off');
    if(alive.current)setCalendarEnabled(enabled);
  },[userId]);
  useEffect(()=>{let canceled=false;void AsyncStorage.getItem(`${workspaceCacheKey(userId)}:calendar`).then(value=>{if(!canceled)setCalendarEnabled(value==='on')}).catch(()=>undefined);return()=>{canceled=true;void updateCalendarNotifications([],userId,false,true).catch(()=>undefined)}},[userId]);
  useEffect(()=>{
    if(!userId||loading)return;
    void updateCalendarNotifications((workspace.officeItems||[]).filter(item=>item.leadId===0||workspace.leads.some(lead=>lead.id===item.leadId&&!lead.deletedAt)),userId,calendarReminders).catch(()=>{if(alive.current)setError("Calendar reminders could not update. Open Calendar and check notification permissions.")});
  },[workspace,userId,loading,calendarReminders]);
  useEffect(()=>{
    Notifications.setNotificationHandler({handleNotification:async notification=>{
      const account=notification.request.content.data?.accountId;
      const show=Boolean(userId)&&(!account||account===userId);
      return {shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};
    }});
    const listener=Notifications.addNotificationResponseReceivedListener(response=>{const data=response.notification.request.content.data;if(data?.type==='calendar'&&data.accountId===userId)router.push('/calendar')});
    return()=>listener.remove();
  },[userId]);
  const operations = useRef(0);
  const sessionToken = useCallback(async () => {
    if (!alive.current || !userId) throw new Error("No active Pacifica session.");
    const result = await tokenRef.current();
    if (!alive.current || !result) throw new Error("No active Pacifica session.");
    return result;
  }, [userId]);
  const publish = useCallback((value: Workspace) => { if (alive.current) setWorkspace(value); }, []);
  const syncRef = useRef<ReturnType<typeof createWorkspaceSync> | null>(null);
  useEffect(() => {
    if (syncRef.current) return;
    const key = workspaceCacheKey(userId);
    syncRef.current = createWorkspaceSync({
      load: async () => {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        try {
          const value = JSON.parse(raw) as Snapshot;
          return value.workspace && Array.isArray(value.workspace.leads) && Array.isArray(value.pending) ? value : null;
        } catch { return null; }
      },
      save: snapshot => AsyncStorage.setItem(key, JSON.stringify(snapshot)),
      get: async () => getWorkspace(await sessionToken()),
      put: async value => putWorkspace(await sessionToken(), value),
      publish,
    });
  }, [userId, sessionToken, publish]);

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (!userId || !alive.current) return;
    operations.current++;
    setSyncing(true);
    try {
      await operation();
      if (alive.current) { setOffline(false); setError(""); }
    } catch (reason) {
      if (alive.current) {
        setOffline(true);
        setError(reason instanceof Error ? reason.message : "Unable to sync. Saved edits will retry when online.");
      }
    } finally {
      operations.current--;
      if (alive.current) { setSyncing(operations.current > 0); setLoading(false); }
    }
  }, [userId]);
  const refresh = useCallback(() => run(() => syncRef.current!.refresh()), [run]);
  const updateLead = useCallback((id: number, patch: Partial<Lead>) => run(() => syncRef.current!.edit({ leadId: id, patch: {
    ...patch,
    ...(patch.notes!==undefined?{notesUpdatedAt:new Date().toISOString()}:{}),
    ...(Object.prototype.hasOwnProperty.call(patch, "deletedAt") ? { deletionUpdatedAt: new Date().toISOString() } : {}),
  } })), [run]);
  const updateProfile = useCallback((patch: Record<string, unknown>) => run(() => syncRef.current!.edit({ patch })), [run]);

  useEffect(() => {
    alive.current = true;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 30000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { alive.current = false; clearTimeout(initial); clearInterval(timer); subscription.remove(); };
  }, [refresh]);

  // Register once per account, through the same ordered edit queue as user changes.
  useEffect(() => {
    if (!userId) return;
    let canceled = false;
    void (async () => {
      try {
        await Notifications.setNotificationChannelAsync("pacifica", { name: "Pacifica messages", importance: Notifications.AndroidImportance.HIGH });
        const current = await Notifications.getPermissionsAsync();
        const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted" || !Device.isDevice || canceled) return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (!canceled && token) await updateProfile({ expoPushToken: token });
      } catch { /* Push notifications are optional. */ }
    })();
    return () => { canceled = true; };
  }, [userId, updateProfile]);

  useEffect(() => {
    if (!userId) return;
    let canceled = false;
    void (async () => {
      try {
        const items = inboundItems(workspace);
        const readKey = `${workspaceCacheKey(userId)}:read`;
        const seenKey = `${workspaceCacheKey(userId)}:notified`;
        const [read, seenRaw] = await Promise.all([AsyncStorage.getItem(readKey), AsyncStorage.getItem(seenKey)]);
        if (canceled) return;
        setUnreadMessages(items.filter(item => item.time > (Number(read) || 0)).length);
        const latest = items[0], seen = Number(seenRaw) || 0;
        if (!latest || latest.time <= seen) return;
        const permission = await Notifications.getPermissionsAsync();
        if (canceled) return;
        await AsyncStorage.setItem(seenKey, String(latest.time));
        if (seen && permission.status === "granted" && !canceled) await Notifications.scheduleNotificationAsync({
          content: { title: `New message from ${latest.lead.name}`, body: String(latest.item.body || latest.item.text || latest.item.subject || "Open Pacifica to reply."), data: { leadId: latest.lead.id } }, trigger: null,
        });
      } catch { /* Notification failures must never roll back workspace state. */ }
    })();
    return () => { canceled = true; };
  }, [workspace, userId]);
  const markMessagesRead = useCallback(async () => {
    await AsyncStorage.setItem(`${workspaceCacheKey(userId)}:read`, String(Date.now()));
    if (alive.current) setUnreadMessages(0);
  }, [userId]);
  const visibleWorkspace = useMemo(() => ({ ...workspace, leads: workspace.leads.filter(lead => !lead.deletedAt) }), [workspace]);
  const value = useMemo(() => ({ workspace: visibleWorkspace, loading, syncing, offline, error, unreadMessages, calendarReminders, setCalendarReminders, refresh, markMessagesRead, updateLead, updateProfile }), [visibleWorkspace, loading, syncing, offline, error, unreadMessages, calendarReminders, setCalendarReminders, refresh, markMessagesRead, updateLead, updateProfile]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
