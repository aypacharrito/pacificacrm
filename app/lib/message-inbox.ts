type Channel = "sms" | "email";
type Contact = {id: number; phone: string; email: string; stage: string; doNotCall: boolean; smsOptOut?: boolean; emailOptOut?: boolean};
type Sms = {direction: string; from?: string; body: string; sentAt: string};
type InboxLead = {stage?:string;status?:string;outcome?:string};
/** SMS Reply is the owner's Interested list; message traffic cannot promote a lead. */
export function matchesConversationFilter(lead:InboxLead, channel:Channel, filter:string, closed:boolean, messages:{direction:string}[]) {
  if (closed !== (filter === "closed")) return false;
  if (filter === "replies") return channel === "sms"
    ? [lead.stage,lead.status,lead.outcome].some(value => String(value || "").trim().toLowerCase() === "interested")
    : messages.some(message => /inbound/i.test(message.direction));
  if (filter === "sent") return messages.some(message => /outbound/i.test(message.direction));
  return true;
}
const phoneKey = (value: string) => value.replace(/\D/g, "").slice(-10);
export const isSmsStopReply = (value: string) => /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i.test(value);
export const isSmsStartReply = (value: string) => /^\s*(start|yes|unstop)\s*[.!]?\s*$/i.test(value);

// Only inbound commands affect the inbox. An outgoing STOP footer is not an opt-out.
export function stoppedSmsPhones(messages: Sms[]) {
  const latest = new Map<string, {time: number; stopped: boolean}>();
  for (const message of messages) {
    if (!/inbound/i.test(message.direction)) continue;
    const stopped = isSmsStopReply(message.body);
    if (!stopped && !isSmsStartReply(message.body)) continue;
    const phone = phoneKey(message.from || "");
    if (!phone) continue;
    const time = Date.parse(message.sentAt) || 0;
    if (!latest.has(phone) || time >= latest.get(phone)!.time) latest.set(phone, {time, stopped});
  }
  return new Set([...latest].filter(([, command]) => command.stopped).map(([phone]) => phone));
}

export function conversationInboxStatus(leads: Contact[], channel: Channel, stoppedPhones: Set<string>) {
  const key = (lead: Contact) => channel === "sms" ? phoneKey(lead.phone) : lead.email.trim().toLowerCase();
  const optedOut = new Set(channel === "sms" ? stoppedPhones : []);
  const blocked = new Set<string>();
  for (const lead of leads) {
    const address = key(lead);
    if (!address) continue;
    if (channel === "sms" ? lead.smsOptOut : lead.emailOptOut) optedOut.add(address);
    if (lead.doNotCall) blocked.add(address);
  }
  return new Map(leads.map(lead => {
    const address = key(lead);
    const optOut = Boolean((channel === "sms" ? lead.smsOptOut : lead.emailOptOut) || (address && optedOut.has(address)));
    return [lead.id, {optedOut: optOut, closed: lead.stage === "Closed" || lead.doNotCall || optOut || Boolean(address && blocked.has(address))}];
  }));
}
