import test from 'node:test';
import assert from 'node:assert/strict';
import { CALIFORNIA_PROGRAMS, CA_RATING_REGISTRY_AS_OF, evaluateCaliforniaRatingEligibility } from '../app/lib/ca-rating-eligibility.ts';

test('the November 27 public filing dispositions are tracked separately from carrier quote eligibility', () => {
  const dispositions = CALIFORNIA_PROGRAMS.map(({ filingId, serffTracking, filingStatus, evidenceAsOf }) => {
    assert.equal(evidenceAsOf, '2026-11-27');
    return [filingId, serffTracking, filingStatus];
  });
  assert.deepEqual(dispositions, [
    ['24-1139', 'GMMX-134127116', 'Closed - Approved'],
    ['26-1481', 'GMMX-135019770', 'Pending with Waiver'],
    ['26-1598', 'MERY-135039801', 'Pending with Waiver'],
    ['26-1599', 'MERY-135039802', 'Pending with Waiver'],
    ['26-486', 'BRWS-134878085', 'Pending with Waiver'],
    ['25-2014', 'MERY-134655346', 'Closed - Approved'],
  ]);
});

test('all six unverified programs fail closed to a carrier quote', () => {
  assert.equal(CALIFORNIA_PROGRAMS.length, 6);
  for (const program of CALIFORNIA_PROGRAMS) {
    const result = evaluateCaliforniaRatingEligibility({
      filingId: program.filingId,
      termType: 'new',
      effectiveDate: CA_RATING_REGISTRY_AS_OF,
      vehicleSymbols: ['synthetic-symbol'],
    });
    assert.equal(result.outcome, 'carrier_quote_required', program.filingId);
    assert.equal(result.handoff, 'Carrier quote required', program.filingId);
    assert.equal(result.program?.verification, 'unverified', program.filingId);
    assert.ok(result.reasons.some(reason => reason.code === 'PROGRAM_RULES_UNVERIFIED'));
    assert.ok(result.reasons.some(reason => reason.code === 'APPROVAL_AND_EFFECTIVE_STATUS_UNVERIFIED'));
  }
});

test('new and renewal terms both hand off without inferring eligibility', () => {
  for (const termType of ['new', 'renewal']) {
    const result = evaluateCaliforniaRatingEligibility({
      filingId: '26-1481', termType, effectiveDate: '2026-10-31', vehicleSymbols: ['symbol'],
    });
    assert.equal(result.termType, termType);
    assert.equal(result.outcome, 'carrier_quote_required');
  }
});

test('effective-date boundaries and dates beyond the evidence snapshot remain unavailable', () => {
  for (const effectiveDate of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-27', '2026-11-28']) {
    const result = evaluateCaliforniaRatingEligibility({
      filingId: '25-2014', termType: 'renewal', effectiveDate,
    });
    assert.equal(result.effectiveDate, effectiveDate);
    assert.equal(result.outcome, 'carrier_quote_required');
    assert.ok(result.reasons.some(reason => reason.code === 'EFFECTIVE_DATE_RULES_UNVERIFIED'));
  }
});

test('missing inputs produce explicit reasons and still fail closed', () => {
  const result = evaluateCaliforniaRatingEligibility({ filingId: '24-1139' });
  const codes = result.reasons.map(reason => reason.code);
  assert.ok(codes.includes('POLICY_TERM_MISSING_OR_UNSUPPORTED'));
  assert.ok(codes.includes('EFFECTIVE_DATE_MISSING_OR_INVALID'));
  assert.ok(codes.includes('VEHICLE_SYMBOLS_MISSING'));
  assert.equal(result.outcome, 'carrier_quote_required');
});

test('invalid effective date, missing symbols, and unresolved risks never become an eligibility decision', () => {
  const result = evaluateCaliforniaRatingEligibility({
    filingId: '26-1599', termType: 'renewal', effectiveDate: '2026-02-30', vehicleSymbols: [], riskFlags: ['unresolved carrier question'],
  });
  const codes = result.reasons.map(reason => reason.code);
  assert.equal(result.effectiveDate, null);
  assert.ok(codes.includes('EFFECTIVE_DATE_MISSING_OR_INVALID'));
  assert.ok(codes.includes('VEHICLE_SYMBOLS_MISSING'));
  assert.ok(codes.includes('UNDERWRITING_RISK_REQUIRES_CARRIER_REVIEW'));
  assert.equal(result.outcome, 'carrier_quote_required');
  assert.equal('premium' in result, false);
});

test('unknown filings and adverse synthetic inputs are unavailable, not automatically ineligible', () => {
  const result = evaluateCaliforniaRatingEligibility({
    filingId: 'unknown', termType: 'new', effectiveDate: '2026-11-27', riskFlags: ['synthetic risk'],
  });
  assert.equal(result.program, null);
  assert.equal(result.outcome, 'carrier_quote_required');
  assert.ok(result.reasons.some(reason => reason.code === 'PROGRAM_NOT_IN_REGISTRY'));
  assert.ok(result.reasons.some(reason => reason.code === 'UNDERWRITING_RISK_REQUIRES_CARRIER_REVIEW'));
  assert.equal(result.reasons.some(reason => reason.code === 'ELIGIBLE'), false);
  assert.equal(result.reasons.some(reason => reason.code === 'INELIGIBLE'), false);
});
