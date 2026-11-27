import {workspaceRedis} from './workspace-redis';
import {cloudCheckIntervalMinutes} from './cloud-schedule';

const kinds = ['ai', 'manual', 'scheduled'] as const;
type RunKind = typeof kinds[number];
const key = (workspace: string, kind: RunKind) => `pacifica:v1:workspace-health:${encodeURIComponent(workspace)}:${kind}`;

/** Store only a completion time. A failed telemetry write must not repeat the completed operation. */
export async function recordHealthRun(workspace: string, kind: RunKind) {
  await workspaceRedis(['SET', key(workspace, kind), new Date().toISOString(), 'EX', 30 * 86400]).catch(() => null);
}

export async function readHealthRuns(workspace: string, now = Date.now()) {
  const values = await workspaceRedis(['MGET', ...kinds.map(kind => key(workspace, kind))]).catch(() => null);
  const dates = kinds.map((_, i) => {
    const value = Array.isArray(values) ? values[i] : null;
    const at = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(at) && at <= now ? new Date(at).toISOString() : null;
  });
  const [ai, manual, scheduled] = dates;
  const scheduledRecent = Boolean(scheduled && now - Date.parse(scheduled) <= (2 * cloudCheckIntervalMinutes + 1) * 60000);
  return {ai, manual, scheduled, scheduledRecent};
}
