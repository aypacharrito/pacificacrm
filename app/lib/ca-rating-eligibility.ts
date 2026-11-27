/**
 * Deterministic California program handoff registry.
 *
 * This module is intentionally not a rating engine. The listed program
 * evidence is incomplete for a current, program-specific eligibility decision,
 * so each known filing fails closed to a carrier quote.
 */

export const CA_RATING_REGISTRY_VERSION = "ca-program-review-2026-11-27.2" as const;
export const CA_RATING_REGISTRY_AS_OF = "2026-11-27" as const;

export type CaliforniaProgram = {
  filingId: string;
  insurer: string;
  program: string;
  line: "personal-auto" | "homeowners";
  verification: "unverified";
  evidenceAsOf: "2026-10-31" | "2026-11-27";
  vehicleSymbolsRequiredForReview: boolean;
  provenance: readonly string[];
};

/**
 * Provenance notes are source pointers and observed filing metadata only.
 * They are not underwriting rules, rates, or proof of current applicability.
 */
export const CALIFORNIA_PROGRAMS: readonly CaliforniaProgram[] = [
  {
    filingId: "24-1139",
    insurer: "Integon Preferred Insurance Company",
    program: "Value",
    line: "personal-auto",
    verification: "unverified",
    evidenceAsOf: "2026-11-27",
    vehicleSymbolsRequiredForReview: true,
    provenance: [
      "GMMX-134127116 p. 6 records approval May 29, 2025 and effective dates July 15, 2025. The June 5 carrier note on p. 68 specifies August 1, 2025.",
      "The schedule on p. 72 identifies Exhibit 12. Its nine rate-factor pages are physical pp. 73–81 and its two coverage algorithm pages are pp. 82–83 (CDI-00016569–CDI-00016579).",
      "Page 73 distinguishes Value Option base rates. Page 74 lists a separate towing base. The carrier must confirm which base, limits, vehicle symbols and rule revisions apply to the risk.",
      "The filing includes older rules beginning on p. 708 and the reconciliation on p. 1500. Effective applicability and authorized carrier comparisons remain outstanding.",
    ],
  },
  {
    filingId: "26-1481",
    insurer: "Integon National Insurance Company",
    program: "Summit",
    line: "personal-auto",
    verification: "unverified",
    evidenceAsOf: "2026-11-27",
    vehicleSymbolsRequiredForReview: true,
    provenance: ["Program/filing identification supplied for this review; current program rules and applicability are not verified."],
  },
  {
    filingId: "26-1598",
    insurer: "Mercury Insurance Company",
    program: "Auto",
    line: "personal-auto",
    verification: "unverified",
    evidenceAsOf: "2026-11-27",
    vehicleSymbolsRequiredForReview: true,
    provenance: ["Program/filing identification supplied for this review; current program rules and applicability are not verified."],
  },
  {
    filingId: "26-1599",
    insurer: "California Automobile Insurance Company",
    program: "Auto",
    line: "personal-auto",
    verification: "unverified",
    evidenceAsOf: "2026-11-27",
    vehicleSymbolsRequiredForReview: true,
    provenance: ["Program/filing identification supplied for this review; current program rules and applicability are not verified."],
  },
  {
    filingId: "26-486",
    insurer: "Coast National Insurance Company",
    program: "Basic",
    line: "personal-auto",
    verification: "unverified",
    evidenceAsOf: "2026-11-27",
    vehicleSymbolsRequiredForReview: true,
    provenance: ["Program/filing identification supplied for this review; current program rules and applicability are not verified."],
  },
  {
    filingId: "25-2014",
    insurer: "California Automobile Insurance Company",
    program: "Homeowners",
    line: "homeowners",
    verification: "unverified",
    evidenceAsOf: "2026-10-31",
    vehicleSymbolsRequiredForReview: false,
    provenance: [
      "The downloaded 25-2014 disposition records approval June 2, 2026 and new and renewal effective dates October 15, 2026. The CDI workbook through October 31, 2026 lists the filing on row 445.",
      "This homeowners change requires the complete applicable manual and coverage-level carrier comparisons before a local estimate can be used.",
    ],
  },
] as const;

export type PolicyTermType = "new" | "renewal";

export type RatingEligibilityInput = {
  filingId: string;
  termType?: PolicyTermType | string | null;
  /** ISO calendar date (YYYY-MM-DD); parsed as a date-only value, never local time. */
  effectiveDate?: string | null;
  vehicleSymbols?: readonly string[] | null;
  /** Caller-supplied unresolved underwriting concerns; no risk rule is inferred here. */
  riskFlags?: readonly string[] | null;
};

export type RatingEligibilityReasonCode =
  | "PROGRAM_NOT_IN_REGISTRY"
  | "PROGRAM_RULES_UNVERIFIED"
  | "APPROVAL_AND_EFFECTIVE_STATUS_UNVERIFIED"
  | "CARRIER_DECISION_REQUIRED"
  | "POLICY_TERM_MISSING_OR_UNSUPPORTED"
  | "EFFECTIVE_DATE_MISSING_OR_INVALID"
  | "EFFECTIVE_DATE_RULES_UNVERIFIED"
  | "VEHICLE_SYMBOLS_MISSING"
  | "UNDERWRITING_RISK_REQUIRES_CARRIER_REVIEW";

export type RatingEligibilityReason = {
  code: RatingEligibilityReasonCode;
  message: string;
};

export type RatingEligibilityResult = {
  outcome: "carrier_quote_required";
  handoff: "Carrier quote required";
  registryVersion: typeof CA_RATING_REGISTRY_VERSION;
  program: CaliforniaProgram | null;
  termType: PolicyTermType | null;
  effectiveDate: string | null;
  reasons: RatingEligibilityReason[];
};

const REASON_MESSAGES: Record<RatingEligibilityReasonCode, string> = {
  PROGRAM_NOT_IN_REGISTRY: "This filing is not in the California program registry; a carrier must review it.",
  PROGRAM_RULES_UNVERIFIED: "Current program-specific underwriting rules have not been verified.",
  APPROVAL_AND_EFFECTIVE_STATUS_UNVERIFIED: "Current approval and applicability status have not been verified for this program.",
  CARRIER_DECISION_REQUIRED: "Only the carrier can determine eligibility and provide a quote.",
  POLICY_TERM_MISSING_OR_UNSUPPORTED: "Select new business or renewal so the carrier can review the correct policy term.",
  EFFECTIVE_DATE_MISSING_OR_INVALID: "Provide a valid effective date in YYYY-MM-DD format for carrier review.",
  EFFECTIVE_DATE_RULES_UNVERIFIED: "No verified effective-date boundary is available for this program; do not infer eligibility from the filing date.",
  VEHICLE_SYMBOLS_MISSING: "Vehicle symbols are missing; carrier review is required before an auto eligibility decision.",
  UNDERWRITING_RISK_REQUIRES_CARRIER_REVIEW: "One or more unresolved risk items require carrier review.",
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Returns a carrier handoff for every program in this unverified registry.
 * It deliberately cannot return an eligible result or calculate a premium.
 */
export function evaluateCaliforniaRatingEligibility(input: RatingEligibilityInput): RatingEligibilityResult {
  const program = CALIFORNIA_PROGRAMS.find(item => item.filingId === String(input.filingId).trim()) ?? null;
  const validTerm = input.termType === "new" || input.termType === "renewal" ? input.termType : null;
  const validEffectiveDate = isIsoDate(input.effectiveDate) ? input.effectiveDate : null;
  const reasons: RatingEligibilityReason[] = [];
  const add = (code: RatingEligibilityReasonCode) => reasons.push({ code, message: REASON_MESSAGES[code] });

  if (!program) {
    add("PROGRAM_NOT_IN_REGISTRY");
  } else {
    add("PROGRAM_RULES_UNVERIFIED");
    add("APPROVAL_AND_EFFECTIVE_STATUS_UNVERIFIED");
  }
  if (!validTerm) add("POLICY_TERM_MISSING_OR_UNSUPPORTED");
  if (!validEffectiveDate) add("EFFECTIVE_DATE_MISSING_OR_INVALID");
  // A supplied date still cannot be compared with an unverified carrier rule.
  if (program) add("EFFECTIVE_DATE_RULES_UNVERIFIED");
  if (program?.vehicleSymbolsRequiredForReview && !(input.vehicleSymbols ?? []).some(symbol => String(symbol).trim().length > 0)) {
    add("VEHICLE_SYMBOLS_MISSING");
  }
  if ((input.riskFlags ?? []).some(flag => String(flag).trim().length > 0)) {
    add("UNDERWRITING_RISK_REQUIRES_CARRIER_REVIEW");
  }
  add("CARRIER_DECISION_REQUIRED");

  return {
    outcome: "carrier_quote_required",
    handoff: "Carrier quote required",
    registryVersion: CA_RATING_REGISTRY_VERSION,
    program,
    termType: validTerm,
    effectiveDate: validEffectiveDate,
    reasons,
  };
}
