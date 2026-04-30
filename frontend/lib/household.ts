/**
 * Build a PolicyEngine household situation for the PE API.
 *
 * For the WV SB 392 tax-cut dashboard:
 * - PolicyEngine baseline already reflects the SB 392 cut (post-cut rates).
 * - The "revert" policy reverts the 2026 rates back to 2025 values.
 * - The household calculator uses revert as the *baseline* and current law
 *   as the *reform* so impact = current_law - pre_cut (positive = household
 *   gains under the cut).
 */

import type { HouseholdRequest } from "./types";

const GROUP_UNITS = ["families", "spm_units", "tax_units", "households"] as const;

/**
 * Revert-reform policy: rolls 2026 WV income tax rates back to their 2025
 * values. Mirrors reform_revert.json so the household calculator ships
 * the same overrides used by Modal.
 */
const REVERT_POLICY: Record<string, Record<string, number>> = {
  "gov.states.wv.tax.income.rates.single[0].rate": { "2026-01-01.2100-12-31": 0.0222 },
  "gov.states.wv.tax.income.rates.single[1].rate": { "2026-01-01.2100-12-31": 0.0296 },
  "gov.states.wv.tax.income.rates.single[2].rate": { "2026-01-01.2100-12-31": 0.0333 },
  "gov.states.wv.tax.income.rates.single[3].rate": { "2026-01-01.2100-12-31": 0.0444 },
  "gov.states.wv.tax.income.rates.single[4].rate": { "2026-01-01.2100-12-31": 0.0482 },
  "gov.states.wv.tax.income.rates.joint[0].rate": { "2026-01-01.2100-12-31": 0.0222 },
  "gov.states.wv.tax.income.rates.joint[1].rate": { "2026-01-01.2100-12-31": 0.0296 },
  "gov.states.wv.tax.income.rates.joint[2].rate": { "2026-01-01.2100-12-31": 0.0333 },
  "gov.states.wv.tax.income.rates.joint[3].rate": { "2026-01-01.2100-12-31": 0.0444 },
  "gov.states.wv.tax.income.rates.joint[4].rate": { "2026-01-01.2100-12-31": 0.0482 },
  "gov.states.wv.tax.income.rates.head[0].rate": { "2026-01-01.2100-12-31": 0.0222 },
  "gov.states.wv.tax.income.rates.head[1].rate": { "2026-01-01.2100-12-31": 0.0296 },
  "gov.states.wv.tax.income.rates.head[2].rate": { "2026-01-01.2100-12-31": 0.0333 },
  "gov.states.wv.tax.income.rates.head[3].rate": { "2026-01-01.2100-12-31": 0.0444 },
  "gov.states.wv.tax.income.rates.head[4].rate": { "2026-01-01.2100-12-31": 0.0482 },
  "gov.states.wv.tax.income.rates.surviving_spouse[0].rate": { "2026-01-01.2100-12-31": 0.0222 },
  "gov.states.wv.tax.income.rates.surviving_spouse[1].rate": { "2026-01-01.2100-12-31": 0.0296 },
  "gov.states.wv.tax.income.rates.surviving_spouse[2].rate": { "2026-01-01.2100-12-31": 0.0333 },
  "gov.states.wv.tax.income.rates.surviving_spouse[3].rate": { "2026-01-01.2100-12-31": 0.0444 },
  "gov.states.wv.tax.income.rates.surviving_spouse[4].rate": { "2026-01-01.2100-12-31": 0.0482 },
  "gov.states.wv.tax.income.rates.separate[0].rate": { "2026-01-01.2100-12-31": 0.0222 },
  "gov.states.wv.tax.income.rates.separate[1].rate": { "2026-01-01.2100-12-31": 0.0296 },
  "gov.states.wv.tax.income.rates.separate[2].rate": { "2026-01-01.2100-12-31": 0.0333 },
  "gov.states.wv.tax.income.rates.separate[3].rate": { "2026-01-01.2100-12-31": 0.0444 },
  "gov.states.wv.tax.income.rates.separate[4].rate": { "2026-01-01.2100-12-31": 0.0482 },
};

function addMemberToUnits(
  situation: Record<string, unknown>,
  memberId: string
): void {
  for (const unit of GROUP_UNITS) {
    const unitObj = situation[unit] as Record<string, { members: string[] }>;
    const key = Object.keys(unitObj)[0];
    unitObj[key].members.push(memberId);
  }
}

export function buildHouseholdSituation(
  params: HouseholdRequest
): Record<string, unknown> {
  const {
    age_head,
    age_spouse,
    dependent_ages,
    income,
    year,
    max_earnings,
    state_code,
  } = params;
  const effectiveStateCode = state_code || "WV";
  const yearStr = String(year);
  const axisMax = Math.max(max_earnings, income);

  const situation: Record<string, unknown> = {
    people: {
      you: {
        age: { [yearStr]: age_head },
        employment_income: { [yearStr]: null },
      },
    },
    families: { "your family": { members: ["you"] } },
    marital_units: { "your marital unit": { members: ["you"] } },
    spm_units: { "your household": { members: ["you"] } },
    tax_units: {
      "your tax unit": {
        members: ["you"],
        adjusted_gross_income: { [yearStr]: null },
        income_tax: { [yearStr]: null },
        wv_income_tax: { [yearStr]: null },
      },
    },
    households: {
      "your household": {
        members: ["you"],
        state_code: { [yearStr]: effectiveStateCode },
        household_net_income: { [yearStr]: null },
      },
    },
    axes: [
      [
        {
          name: "employment_income",
          min: 0,
          max: axisMax,
          count: Math.min(4001, Math.max(501, Math.floor(axisMax / 500))),
          period: yearStr,
          target: "person",
        },
      ],
    ],
  };

  if (age_spouse != null) {
    const people = situation.people as Record<string, Record<string, unknown>>;
    people["your partner"] = { age: { [yearStr]: age_spouse } };
    addMemberToUnits(situation, "your partner");
    const maritalUnits = situation.marital_units as Record<string, { members: string[] }>;
    maritalUnits["your marital unit"].members.push("your partner");
  }

  for (let i = 0; i < dependent_ages.length; i++) {
    const childId =
      i === 0
        ? "your first dependent"
        : i === 1
          ? "your second dependent"
          : `dependent_${i + 1}`;

    const people = situation.people as Record<string, Record<string, unknown>>;
    people[childId] = { age: { [yearStr]: dependent_ages[i] } };
    addMemberToUnits(situation, childId);
    const maritalUnits = situation.marital_units as Record<string, { members: string[] }>;
    maritalUnits[`${childId}'s marital unit`] = {
      members: [childId],
    };
  }

  return situation;
}

/**
 * Build the revert policy dict for the PE API. Used by the household
 * calculator as the *baseline*: applying it rolls WV's 2026 rates back to
 * 2025 values, so impact = current_law - revert isolates the SB 392 cut.
 */
export function buildRevertPolicy(): Record<string, Record<string, number>> {
  return REVERT_POLICY;
}

/**
 * Linear interpolation helper - find the value at `x` in sorted arrays.
 */
export function interpolate(
  xs: number[],
  ys: number[],
  x: number
): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= x) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}
