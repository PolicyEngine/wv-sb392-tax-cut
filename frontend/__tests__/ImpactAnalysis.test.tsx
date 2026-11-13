import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ImpactAnalysis from '../components/ImpactAnalysis';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';
import { api, HouseholdCalculationError } from '../lib/api';
import type { HouseholdImpactResponse, HouseholdRequest } from '../lib/types';

// Without a measured size Recharts draws nothing, so the chart and its
// x-axis become elements that show what these tests read, and the other
// chart parts draw nothing.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const drawsNothing = () => null;
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({ children }: { children: ReactNode }) => (
      <div data-testid="line-chart">{children}</div>
    ),
    XAxis: ({ domain }: { domain: unknown }) => (
      <div data-testid="x-axis" data-domain={JSON.stringify(domain)} />
    ),
    YAxis: drawsNothing,
    CartesianGrid: drawsNothing,
    Tooltip: drawsNothing,
    Legend: drawsNothing,
    ReferenceLine: drawsNothing,
    Line: drawsNothing,
  };
});

// The household calculated before the one the page shows now.
const earlierRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 50000,
  year: 2026,
  max_earnings: 100000,
  state_code: 'WV',
};
const householdRequest: HouseholdRequest = { ...earlierRequest, income: 75000 };

/**
 * An answer in which net income rises by `difference` at the household's
 * income, all of it from a lower West Virginia income tax.
 */
function impactAnswer(
  difference: number,
  xAxisMax = 100000,
): HouseholdImpactResponse {
  return {
    income_range: [0, 50000, xAxisMax],
    net_income_change: [0, difference, 0],
    federalTaxChange: [0, 0, 0],
    stateTaxChange: [0, -difference, 0],
    netIncomeChange: [0, difference, 0],
    benefit_at_income: {
      baseline: 50000,
      reform: 50000 + difference,
      difference,
      federal_tax_change: 0,
      state_tax_change: -difference,
      net_income_change: difference,
    },
    x_axis_max: xAxisMax,
  };
}

// A precomputed example household, with its chart up to $200,000.
const exampleRequest: HouseholdRequest = {
  age_head: 40,
  age_spouse: 35,
  dependent_ages: [8, 12],
  income: 40000,
  year: 2026,
  max_earnings: 200000,
  state_code: 'WV',
};
const exampleAnswer = impactAnswer(500, 200000);

const refusal = new HouseholdCalculationError(
  'Everyone on your network, such as a workshop or an office, shares a ' +
    'limit on calculations a minute, and it has been reached.',
  429,
  false,
  true,
);

interface ShownProps {
  request: HouseholdRequest;
  maxEarnings?: number;
  precomputed?: HouseholdImpactResponse | null;
  onShownRequestChange?: (request: HouseholdRequest | null) => void;
}

/** Renders the results for `firstProps`, and returns a way to show others. */
function renderImpactAnalysis(queryClient: QueryClient, firstProps: ShownProps) {
  const resultsFor = (props: ShownProps) => (
    <QueryClientProvider client={queryClient}>
      <ImpactAnalysis
        triggered
        maxEarnings={props.request.max_earnings}
        {...props}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(resultsFor(firstProps));
  return (props: ShownProps) => rerender(resultsFor(props));
}

afterEach(() => {
  vi.restoreAllMocks();
  pauseHouseholdCalculations(0);
});

describe('ImpactAnalysis', () => {
  it('shows the last answer and the notice after a rate-limit refusal', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['householdImpact', earlierRequest], impactAnswer(350));
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(refusal);
    const showResults = renderImpactAnalysis(queryClient, { request: earlierRequest });

    showResults({ request: householdRequest });

    expect(await screen.findByText(refusal.message)).toBeInTheDocument();
    // The explanation beside the Calculate button is the page's one live
    // region for the pause, so the notice is not another.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // The earlier household's income and answer, not the refused one's.
    expect(screen.getByText('$50,000')).toBeInTheDocument();
    expect(screen.getByText('+$350/year')).toBeInTheDocument();
    expect(screen.queryByText('$75,000')).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('shows the answer that was on screen after a refusal, not the one calculated last', async () => {
    // The reader calculated the earlier household, then another, then went
    // back to the earlier one, which the page showed from the cache.
    const queryClient = new QueryClient();
    const otherRequest = { ...earlierRequest, income: 60000 };
    queryClient.setQueryData(['householdImpact', earlierRequest], impactAnswer(350), {
      updatedAt: 1_000,
    });
    queryClient.setQueryData(['householdImpact', otherRequest], impactAnswer(300), {
      updatedAt: 2_000,
    });
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(refusal);
    const showResults = renderImpactAnalysis(queryClient, { request: earlierRequest });

    showResults({ request: householdRequest });

    await screen.findByText(refusal.message);
    expect(screen.getByText('$50,000')).toBeInTheDocument();
    expect(screen.getByText('+$350/year')).toBeInTheDocument();
    expect(screen.queryByText('$60,000')).not.toBeInTheDocument();
    queryClient.clear();
  });

  it("keeps an example's results, with its own labels, after a refusal", async () => {
    // A live answer was shown, then an example; then "Calculate impact"
    // cleared the example and the calculation was refused.
    const queryClient = new QueryClient();
    queryClient.setQueryData(['householdImpact', earlierRequest], impactAnswer(350));
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(refusal);
    const showResults = renderImpactAnalysis(queryClient, { request: earlierRequest });
    showResults({ request: exampleRequest, precomputed: exampleAnswer });

    showResults({ request: householdRequest, precomputed: null });

    expect(
      await screen.findByText('The results below are for the household shown before.'),
    ).toBeInTheDocument();
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(screen.getByText('+$500/year')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-domain', '[0,200000]');
    expect(screen.queryByText('$50,000')).not.toBeInTheDocument();
    expect(screen.queryByText('$75,000')).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('draws the shown answer on its own range after a refused change of range', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['householdImpact', earlierRequest], impactAnswer(350));
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(refusal);
    const showResults = renderImpactAnalysis(queryClient, { request: earlierRequest });

    // The reader chose the $1M range, and the firewall refused it.
    showResults({
      request: { ...earlierRequest, max_earnings: 1000000 },
      maxEarnings: 1000000,
    });

    await screen.findByText(refusal.message);
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-domain', '[0,100000]');
    queryClient.clear();
  });

  it("tells the page which household's answer is shown", async () => {
    // The page highlights the shown answer's chart range.
    const queryClient = new QueryClient();
    queryClient.setQueryData(['householdImpact', earlierRequest], impactAnswer(350));
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(refusal);
    const onShownRequestChange = vi.fn();
    const showResults = renderImpactAnalysis(queryClient, {
      request: earlierRequest,
      onShownRequestChange,
    });

    showResults({
      request: { ...earlierRequest, max_earnings: 1000000 },
      maxEarnings: 1000000,
      onShownRequestChange,
    });

    await screen.findByText(refusal.message);
    // With its answer, so the page can tell whether it is an example's.
    expect(onShownRequestChange).toHaveBeenLastCalledWith(
      earlierRequest,
      impactAnswer(350),
    );
    queryClient.clear();
  });

  it('shows the household calculated last after a refusal, when it is the one on screen', async () => {
    // The reader calculated one household, then another; the firewall
    // refused the third.
    const queryClient = new QueryClient();
    const secondRequest = { ...earlierRequest, income: 60000 };
    vi.spyOn(api, 'calculateHouseholdImpact').mockImplementation(async (request) => {
      if (request.income === earlierRequest.income) {
        return impactAnswer(350);
      }
      if (request.income === secondRequest.income) {
        return impactAnswer(300);
      }
      throw refusal;
    });
    const showResults = renderImpactAnalysis(queryClient, { request: earlierRequest });
    expect(await screen.findByText('+$350/year')).toBeInTheDocument();
    showResults({ request: secondRequest });
    expect(await screen.findByText('+$300/year')).toBeInTheDocument();

    showResults({ request: householdRequest });

    expect(await screen.findByText(refusal.message)).toBeInTheDocument();
    expect(screen.getByText('$60,000')).toBeInTheDocument();
    expect(screen.getByText('+$300/year')).toBeInTheDocument();
    expect(screen.queryByText('$50,000')).not.toBeInTheDocument();
    expect(screen.queryByText('$75,000')).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('shows a refusal itself after an error panel', async () => {
    // The error panel replaced the earlier answer, so a later refusal must
    // not bring that answer back.
    const queryClient = new QueryClient();
    const failedRequest = { ...earlierRequest, income: 60000 };
    queryClient.setQueryData(['householdImpact', earlierRequest], impactAnswer(350));
    vi.spyOn(api, 'calculateHouseholdImpact').mockImplementation(async (request) => {
      if (request.income === failedRequest.income) {
        throw new HouseholdCalculationError(
          'PolicyEngine could not calculate this household (HTTP 400): Invalid household.',
          400,
          false,
        );
      }
      throw refusal;
    });
    const showResults = renderImpactAnalysis(queryClient, { request: earlierRequest });
    showResults({ request: failedRequest });
    expect(
      await screen.findByText(/could not calculate this household \(HTTP 400\)/),
    ).toBeInTheDocument();

    showResults({ request: householdRequest });

    expect(await screen.findByText(refusal.message)).toBeInTheDocument();
    expect(
      screen.queryByText('The results below are for the household shown before.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('$50,000')).not.toBeInTheDocument();
    queryClient.clear();
  });
});
