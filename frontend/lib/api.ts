/**
 * Household impact via the PolicyEngine API.
 *
 * Calls https://api.policyengine.org/us/calculate directly — no backend
 * server required.
 *
 * For the WV SB 392 tax-cut dashboard:
 *   PolicyEngine baseline already reflects the cut (post-cut rates), so
 *   we run the household sim *with* a revert policy as the baseline and
 *   the unmodified current law as the reform. Impact convention:
 *
 *     impact = reform (current law) - baseline (pre-cut, revert applied)
 *
 *   which is positive when the household nets more under the SB 392 cut.
 */

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildHouseholdSituation,
  buildRevertPolicy,
  interpolate,
} from "./household";

const PE_API_URL = "https://api.policyengine.org";

class ApiError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.status = status;
    this.response = response;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 120000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

interface PEApiResponse {
  result: {
    households: Record<string, Record<string, Record<string, number[]>>>;
    people: Record<string, Record<string, Record<string, number[]>>>;
    tax_units: Record<string, Record<string, Record<string, number[]>>>;
  };
}

async function peCalculate(body: Record<string, unknown>): Promise<PEApiResponse> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/calculate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    const errorMessage = typeof errorBody === 'object' && errorBody?.message
      ? errorBody.message
      : typeof errorBody === 'string'
        ? errorBody
        : JSON.stringify(errorBody);
    throw new ApiError(
      `PolicyEngine API error: ${response.status} - ${errorMessage}`,
      response.status,
      errorBody,
    );
  }
  return response.json();
}

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest,
  ): Promise<HouseholdImpactResponse> {
    const household = buildHouseholdSituation(request);
    const revertPolicy = buildRevertPolicy();
    const yearStr = String(request.year);

    // Baseline applies the revert (= pre-cut rates). Reform is current law.
    // Impact = current law - pre-cut, so positive => household gains under
    // the SB 392 cut.
    const [baselineResult, reformResult] = await Promise.all([
      peCalculate({ household, policy: revertPolicy }),
      peCalculate({ household }),
    ]);

    const baselineNetIncome: number[] =
      baselineResult.result.households["your household"]["household_net_income"][yearStr];
    const reformNetIncome: number[] =
      reformResult.result.households["your household"]["household_net_income"][yearStr];
    const incomeRange: number[] =
      baselineResult.result.people["you"]["employment_income"][yearStr];

    const baselineStateTax: number[] =
      baselineResult.result.tax_units["your tax unit"]["wv_income_tax"][yearStr];
    const reformStateTax: number[] =
      reformResult.result.tax_units["your tax unit"]["wv_income_tax"][yearStr];

    const baselineFederalTax: number[] =
      baselineResult.result.tax_units["your tax unit"]["income_tax"][yearStr];
    const reformFederalTax: number[] =
      reformResult.result.tax_units["your tax unit"]["income_tax"][yearStr];

    // Impact = reform - baseline = current_law - pre_cut.
    const netIncomeChange = reformNetIncome.map(
      (val, i) => val - baselineNetIncome[i],
    );
    const federalTaxChange = reformFederalTax.map(
      (val, i) => val - baselineFederalTax[i],
    );
    const stateTaxChange = reformStateTax.map(
      (val, i) => val - baselineStateTax[i],
    );

    const baselineAtIncome = interpolate(incomeRange, baselineNetIncome, request.income);
    const reformAtIncome = interpolate(incomeRange, reformNetIncome, request.income);
    const baselineFederalTaxAtIncome = interpolate(incomeRange, baselineFederalTax, request.income);
    const reformFederalTaxAtIncome = interpolate(incomeRange, reformFederalTax, request.income);
    const baselineStateTaxAtIncome = interpolate(incomeRange, baselineStateTax, request.income);
    const reformStateTaxAtIncome = interpolate(incomeRange, reformStateTax, request.income);

    const federalTaxChangeAtIncome =
      reformFederalTaxAtIncome - baselineFederalTaxAtIncome;
    const stateTaxChangeAtIncome =
      reformStateTaxAtIncome - baselineStateTaxAtIncome;
    const netIncomeChangeAtIncome = reformAtIncome - baselineAtIncome;

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      federalTaxChange,
      stateTaxChange,
      netIncomeChange,
      benefit_at_income: {
        baseline: baselineAtIncome,
        reform: reformAtIncome,
        difference: netIncomeChangeAtIncome,
        federal_tax_change: federalTaxChangeAtIncome,
        state_tax_change: stateTaxChangeAtIncome,
        net_income_change: netIncomeChangeAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};
