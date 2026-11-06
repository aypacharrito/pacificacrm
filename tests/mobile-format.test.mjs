import assert from "node:assert/strict";
import test from "node:test";
import * as formatModule from "../mobile/src/lib/format.ts";
// Expo is CommonJS; Node 22 exposes these TypeScript exports under default.
const { AVATAR_COLORS, avatarColor, initial, shortTime } = formatModule.default || formatModule;

test("avatars get a stable color and the first real letter", () => {
  assert.equal(avatarColor("Ziad elrachid"), avatarColor("  ziad ELRACHID "));
  assert.ok(AVATAR_COLORS.includes(avatarColor("")));
  assert.equal(initial("ruben chico"), "R");
  assert.equal(initial("  (7-Eleven)"), "7");
  assert.equal(initial("Álvaro"), "Á");
  assert.equal(initial(""), "?");
});

test("message times read like a phone's inbox", () => {
  const now = new Date(2026, 10, 6, 15, 0).getTime();
  assert.match(shortTime(new Date(2026, 10, 6, 10, 52).getTime(), now), /10:52/);
  assert.equal(shortTime(new Date(2026, 10, 5, 9, 0).getTime(), now), new Date(2026, 10, 5).toLocaleDateString([], { weekday: "short" }));
  assert.equal(shortTime(new Date(2026, 9, 4).getTime(), now), new Date(2026, 9, 4).toLocaleDateString([], { month: "short", day: "numeric" }));
  assert.equal(shortTime(new Date(2025, 0, 2).getTime(), now), new Date(2025, 0, 2).toLocaleDateString([], { year: "2-digit", month: "numeric", day: "numeric" }));
  assert.equal(shortTime(0, now), "");
  assert.equal(shortTime(Number.NaN, now), "");
});

test("conversation details: day separators, times and delivery marks", () => {
  const { dayLabel, dayKey, statusIcon, clockTime } = formatModule.default || formatModule;
  const now = new Date(2026, 10, 6, 15, 0).getTime();
  assert.equal(dayLabel(new Date(2026, 10, 6, 9).getTime(), now), "Today");
  assert.equal(dayLabel(new Date(2026, 10, 5, 23).getTime(), now), "Yesterday");
  assert.equal(dayKey(new Date(2026, 10, 6, 1).getTime()), dayKey(new Date(2026, 10, 6, 23).getTime()));
  assert.notEqual(dayKey(new Date(2026, 10, 6).getTime()), dayKey(new Date(2026, 10, 5).getTime()));
  assert.equal(statusIcon("delivered").icon, "check-all");
  assert.equal(statusIcon("sent").icon, "check");
  assert.equal(statusIcon("queued").icon, "clock-outline");
  assert.deepEqual(statusIcon("undelivered"), { icon: "alert-circle-outline", bad: true });
  assert.equal(statusIcon("received"), null);
  assert.match(clockTime(new Date(2026, 10, 6, 16, 31).getTime()), /4:31/);
  assert.equal(clockTime(0), "");
});
