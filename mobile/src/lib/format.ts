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
