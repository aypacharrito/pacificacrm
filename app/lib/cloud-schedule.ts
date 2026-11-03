/** Matches the follow-up cron in vercel.json, including room for a delayed run. */
export const cloudCheckIntervalMinutes=5;
export function cloudAutomationHealth(value:unknown,now=Date.now()){
  const heartbeat=value&&typeof value==="object"?value as Record<string,unknown>:{};
  const started=typeof heartbeat.startedAt==="string"?Date.parse(heartbeat.startedAt):NaN;
  const completed=typeof heartbeat.completedAt==="string"?Date.parse(heartbeat.completedAt):NaN;
  const previous=typeof heartbeat.previousStartedAt==="string"?Date.parse(heartbeat.previousStartedAt):NaN;
  const tolerance=(cloudCheckIntervalMinutes*2+1)*60_000;
  const recent=Number.isFinite(started)&&started<=now&&now-started<=tolerance;
  const frequent=!heartbeat.previousStartedAt||(Number.isFinite(previous)&&started>previous&&started-previous<=tolerance);
  const healthy=recent&&frequent&&completed>=started&&completed<=now&&heartbeat.ok===true&&!heartbeat.alreadyRunning;
  return {healthy,intervalMinutes:cloudCheckIntervalMinutes};
}
