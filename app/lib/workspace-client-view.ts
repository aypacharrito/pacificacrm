// Server-owned data that no client reads from this endpoint (each has its own API). Sending it made every
// load and poll larger and slower. officeItems stays: the phone app reads calendar reminders from here.
const SERVER_ONLY=["smsLedger","voicePilot","voicePilotHistory","voicePilotBlocked","minerState","documentInsights",
  "noteReminders","noteReview","conversationCalendar","aiControl","quoteIntake"] as const;
export function clientWorkspace<T extends Record<string,unknown>>(workspace:T):T{
  const view={...workspace};
  for(const key of SERVER_ONLY)delete view[key];
  return view;
}
