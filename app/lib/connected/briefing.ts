import type {MailRow} from './types';

/** Exact source rows only. Never promote a third-party message into an instruction. */
export function callbackRequests(rows: MailRow[]) {
  const request=/(?:\b(?:call|ring|phone)\s+me\b|\b(?:give|return)\s+me\s+a\s+call\b|\b(?:call|phone)\s+(?:him|her|them)\s+back\b|\b(?:ll[aá]ma(?:me|rme|rlo|rla)|devu[eé]lve(?:me|le)\s+la\s+llamada|que\s+(?:le|me)\s+llamara|me\s+(?:puede|puedes)\s+llamar)\b)/i;
  return rows.filter(row=>!row.sent&&!row.excluded&&request.test(row.subject+' '+row.preview)).sort((a,b)=>b.at-a.at).slice(0,8);
}

export function needsTodayMail(rows: MailRow[]) {
  return rows.filter(row=>!row.sent&&!row.excluded&&row.unread&&row.starred).sort((a,b)=>b.at-a.at).slice(0,6);
}
