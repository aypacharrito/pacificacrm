export const policyVersion: string;

export type TriageLevel = "urgent" | "important" | "action" | "record" | "digest" | "disposable" | "unknown";
export type Assessment = { level: TriageLevel; evidence: { section: number; quote: string } };
export type TriageMessage = {
  id: string;
  threadId: string;
  mailboxId: string;
  mailboxVerified: boolean;
  direction: "inbound";
  labels: string[];
  subject: string;
  bodyParts: string[];
  bodyComplete: boolean;
  attachmentCount: number;
  senderAuthenticated: boolean;
  receivedAtMs: number;
  isNewArrival: boolean;
  threadReviewed?: boolean;
  threadProtected?: boolean;
  ownerHold?: boolean;
  securityIncidentOpen?: boolean;
  priority?: { kind: string; verified: boolean };
  urgency?: { kind: string; verified: boolean };
  securityNotice?: { kind: string; verified: boolean; noticeOnly: boolean; actionPending?: boolean };
  templateMatch?: { id: string; kind: string; approved: boolean; exact: boolean; expiresAt?: string; resolutionVerified?: boolean };
};

export type TriagePolicy = {
  mailboxId?: string;
  ownerId?: string;
  mode: "preview" | "active";
  starEnabled?: boolean;
  trashEnabled?: boolean;
  tasksEnabled?: boolean;
  textEnabled?: boolean;
  ownerPhoneVerified?: boolean;
  starredReviewEnabled?: boolean;
  textStarredReviewEnabled?: boolean;
};

export type TriageEffect = {
  kind: "gmail_trash" | "gmail_star" | "create_task" | "text_owner" | "queue_review";
  messageId: string;
  idempotencyKey: string;
};

export function decideEmail(message: TriageMessage, policy: TriagePolicy, assessment?: Assessment | null, now?: number): {
  policyVersion: string;
  level: string;
  reason: string;
  recheckAt?: string;
  proposedActions: string[];
  effects: TriageEffect[];
};

export function planStarredReview(input: { ownerId: string; localDate: string; pendingCount: number }, policy: TriagePolicy): null | {
  effects: { kind: "create_star_review_task" | "text_star_review"; idempotencyKey: string }[];
};
