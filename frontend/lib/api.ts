/**
 * Household impact via www.policyengine.org's dashboard API.
 *
 * The page never calls the PolicyEngine Public API itself: the dashboard
 * API's server adds PolicyEngine's credential and forwards each household
 * to the Public API's /us/calculate.
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
  createPolicyEngineApiClient,
  PolicyEngineApiError,
} from "@policyengine/api-client";

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildHouseholdSituation,
  buildRevertPolicy,
  interpolate,
} from "./household";

const policyengine = createPolicyEngineApiClient();

/** How long a calculation may take before the page gives up on it. */
const CALCULATION_TIMEOUT_MILLISECONDS = 120_000;

/** Brief gateway failures, which are worth retrying. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** A household calculation failed; `message` is written for the user. */
export class HouseholdCalculationError extends Error {
  override name = "HouseholdCalculationError";

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /** Whether trying again at once could succeed. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Whether React Query should retry a failed household calculation: once,
 * and only after a brief gateway failure. Each attempt sends two
 * calculations, and the firewall allows 30 a minute.
 */
export function shouldRetryHouseholdCalculation(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 1 &&
    error instanceof HouseholdCalculationError &&
    error.retryable
  );
}

function dashboardApiMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return null;
}

/** Turns a failure of the dashboard API client into a message for the user. */
function calculationError(error: PolicyEngineApiError): HouseholdCalculationError {
  if (error.status === null) {
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service could not be reached. If many " +
        "calculations have been run from your network in the last minute, " +
        "wait a minute and try again.",
      null,
      false,
    );
  }
  if (error.status === 429) {
    return new HouseholdCalculationError(
      "Too many calculations have been run from your network in the last " +
        "minute. Wait a minute and try again.",
      429,
      false,
    );
  }
  const detail =
    dashboardApiMessage(error.body) ?? "Try again in a few minutes.";
  return new HouseholdCalculationError(
    `PolicyEngine could not calculate this household (HTTP ${error.status}): ${detail}`,
    error.status,
    RETRYABLE_STATUSES.has(error.status),
  );
}

/** Values over the income axis, keyed by year. */
type ValuesByYear = Record<string, number[]>;

/** The parts of a calculated household this page reads. */
interface CalculatedHousehold {
  people: Record<string, Record<string, ValuesByYear>>;
  households: Record<string, Record<string, ValuesByYear>>;
  tax_units: Record<string, Record<string, ValuesByYear>>;
}

async function calculateHousehold(
  household: Record<string, unknown>,
  policy?: Record<string, unknown>
): Promise<CalculatedHousehold> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CALCULATION_TIMEOUT_MILLISECONDS
  );
  try {
    return await policyengine.calculateHousehold<CalculatedHousehold>(
      { country: "us", household, policy },
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HouseholdCalculationError(
        "The calculation took longer than two minutes. Try again.",
        null,
        false,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      throw calculationError(error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    // Each resolves with the calculated household (the Public API's
    // `result`).
    const [baselineResult, reformResult] = await Promise.all([
      calculateHousehold(household, revertPolicy),
      calculateHousehold(household),
    ]);

    const baselineNetIncome: number[] =
      baselineResult.households["your household"]["household_net_income"][yearStr];
    const reformNetIncome: number[] =
      reformResult.households["your household"]["household_net_income"][yearStr];
    const incomeRange: number[] =
      baselineResult.people["you"]["employment_income"][yearStr];

    const baselineStateTax: number[] =
      baselineResult.tax_units["your tax unit"]["wv_income_tax"][yearStr];
    const reformStateTax: number[] =
      reformResult.tax_units["your tax unit"]["wv_income_tax"][yearStr];

    const baselineFederalTax: number[] =
      baselineResult.tax_units["your tax unit"]["income_tax"][yearStr];
    const reformFederalTax: number[] =
      reformResult.tax_units["your tax unit"]["income_tax"][yearStr];

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
