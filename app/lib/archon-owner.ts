import { accessScope, managedAccessState } from "./account-access-policy";
import { isClerkConfigured } from "./clerk-config";
import type { getPacificaAccess } from "./clerk-access";

type PacificaAccess = Awaited<ReturnType<typeof getPacificaAccess>>;

export function canOpenArchon(access: PacificaAccess): boolean {
  const ownerId = process.env.PACIFICA_ARCHON_OWNER_USER_ID?.trim();
  const workspaceId = process.env.PACIFICA_ARCHON_WORKSPACE_ID?.trim();
  if (!isClerkConfigured() || !access.allowed || access.role !== "owner" || access.teamRole ||
      !ownerId || access.accountUserId !== ownerId || !workspaceId || access.userId !== workspaceId) {
    return false;
  }
  return [access.accessMetadata, access.memberMetadata].every(metadata =>
    accessScope(metadata ?? {}) === "full" && managedAccessState(metadata ?? {}) !== "paused"
  );
}

export function archonWorkspaceUrl(): URL | null {
  const configured = process.env.PACIFICA_ARCHON_WORKSPACE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}
