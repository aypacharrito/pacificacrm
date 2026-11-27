/**
 * Narrow arithmetic exercise from physical p.74 of the local Integon
 * Preferred PPA exhibit (PRA-2026-00949, CDI-00016570).
 *
 * The Value Option T&L base on physical p.73 is 19.12, while p.74's Towing
 * and Labor table has a base of 10.64. Their relationship is not established.
 * Do not combine either base with factors on other pages or apply the p.83
 * coverage algorithm until the carrier confirms the applicable table.
 */
export const INTEGON_DIAGNOSTIC_VERSION = 'integon-ppa-page74-cell-exercise-1';
export const INTEGON_DIAGNOSTIC_DISCLAIMER =
  'Synthetic page-74 base × limit factor only. This is not a coverage calculation, Value premium, eligibility, or quote. Page 73 lists a different Value Option base; effective applicability is unverified. Carrier quote required.';

export type SyntheticTowingResult = {
  kind: 'partial-table-arithmetic';
  version: typeof INTEGON_DIAGNOSTIC_VERSION;
  disclaimer: typeof INTEGON_DIAGNOSTIC_DISCLAIMER;
  base: '10.64';
  factor: string;
  partialProduct: string;
  provenance: readonly string[];
};

const limitFactors = {25:850,35:1000,50:1350} as const;

/** No customer, policy date, discounts, or term may enter this exercise. */
export function calculateSyntheticTowing(raw: unknown): SyntheticTowingResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Synthetic scenario required.');
  const input = raw as Record<string,unknown>;
  if (Object.keys(input).sort().join(',') !== 'limit,scenario' || input.scenario !== 'synthetic-only')
    throw Error('Only page-74 synthetic table inputs are supported.');
  if (typeof input.limit !== 'number' || !Object.hasOwn(limitFactors,input.limit))
    throw Error('Limit factor is unavailable.');
  const factor = limitFactors[input.limit as keyof typeof limitFactors];
  const product = 1064 * factor; // cents × thousandths, exact safe integer arithmetic
  return {
    kind:'partial-table-arithmetic',version:INTEGON_DIAGNOSTIC_VERSION,
    disclaimer:INTEGON_DIAGNOSTIC_DISCLAIMER,
    base:'10.64',factor:`${Math.floor(factor/1000)}.${(factor%1000).toString().padStart(3,'0')}`,
    partialProduct:`${Math.floor(product/100000)}.${(product%100000).toString().padStart(5,'0')}`,
    provenance:[
      'Physical p.74, Towing and Labor Coverage: base rate 10.64 and per-occurrence limit Amount (25: 0.850; 35: 1.000; 50: 1.350).',
      'Physical p.73, Value Option: separate T&L base 19.12; applicability relative to p.74 not established.',
      'Physical p.83, Towing and Labor Algorithm Steps A–D: other factors and final floor are intentionally not applied.',
    ],
  };
}
