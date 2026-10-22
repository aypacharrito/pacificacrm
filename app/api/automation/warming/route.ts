import {warmingMetrics} from "../../../lib/warming-metrics";
import type {WarmingLead} from "../../../lib/lead-warming-policy";
import {getPacificaAccess} from '../../../lib/clerk-access';
import {readStoredWorkspace} from '../../../lib/workspace-storage';
import {budgetTotals,cleanSmsLedger} from '../../../lib/sms-budget';
import {cleanWarming,localDay} from '../../../lib/lead-warming-policy';
export const runtime='nodejs';
export async function GET(){const access=await getPacificaAccess();if(!access.allowed||!access.userId)return Response.json({error:'Sign in required'},{status:403});const w=await readStoredWorkspace(access.userId);if(!w)return Response.json({error:'Workspace unavailable'},{status:404});return Response.json({sources:warmingMetrics(w.leads as WarmingLead[],w.smsLedger),settings:cleanWarming(w.profile.leadWarming),usage:budgetTotals(cleanSmsLedger(w.smsLedger),localDay(new Date(),w.profile.automationTimezone))},{headers:{'Cache-Control':'no-store'}});}
