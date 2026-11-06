/** Small display helpers shared by the list screens (pure, so they are unit-tested from the repo root). */

// Avatar colors in the spirit of Android's contact avatars: distinct, readable with white text in light and dark mode.
export const AVATAR_COLORS = ["#8E2B5C", "#8A4B12", "#5B3FB5", "#0B6A62", "#1E5AA8", "#A23B2A", "#3D6B1F", "#6B4E16"];

export function avatarColor(name: string) {
  let hash = 0;
  for (const char of String(name || "?").trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export function initial(name: string) {
  const letter = Array.from(String(name || "").trim()).find(char => /[\p{L}\p{N}]/u.test(char));
  return (letter || "?").toUpperCase();
}

/** "4:31 PM" (a message's own time, under its bubble). */
export function clockTime(ms: number) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/** Same calendar day (local time) → same key. */
export function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Day separator in a conversation: "Today", "Yesterday", "Wednesday, Oct 28", "Oct 28, 2025". */
export function dayLabel(ms: number, now: number = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms), today = new Date(now);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  return date.toLocaleDateString([], date.getFullYear() === today.getFullYear()
    ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}

/** Delivery mark for a sent text (Twilio statuses): one tick sent, two ticks delivered, a clock while sending. */
export function statusIcon(status?: string): { icon: "check" | "check-all" | "clock-outline" | "alert-circle-outline"; bad: boolean } | null {
  const value = String(status || "").toLowerCase();
  if (!value || value === "received") return null;
  if (value === "failed" || value === "undelivered") return { icon: "alert-circle-outline", bad: true };
  if (value === "delivered" || value === "read") return { icon: "check-all", bad: false };
  if (value === "sent") return { icon: "check", bad: false };
  return { icon: "clock-outline", bad: false };
}

/** "10:52 AM" today, "Thu" this week, "Oct 4" this year, "10/4/25" before that. */
export function shortTime(ms: number, now: number = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms), today = new Date(now);
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = (today.setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000;
  if (days > 0 && days < 7) return date.toLocaleDateString([], { weekday: "short" });
  if (date.getFullYear() === new Date(now).getFullYear()) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { year: "2-digit", month: "numeric", day: "numeric" });
}
