import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import Home from '../app/(shell)/page';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';

// Without a measured size Recharts draws nothing, so the chart parts draw
// nothing here; these tests read the page's text and buttons.
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
    XAxis: drawsNothing,
    YAxis: drawsNothing,
    CartesianGrid: drawsNothing,
    Tooltip: drawsNothing,
    Legend: drawsNothing,
    ReferenceLine: drawsNothing,
    Line: drawsNothing,
  };
});

const DASHBOARD_API_CALCULATE_URL =
  'https://www.policyengine.org/api/household/calculate';

// One precomputed example: net income rises by $500 at $40,000.
const examplePayload = {
  year: 2026,
  households: [
    {
      label: 'Married couple with two children',
      income: 40000,
      age_head: 40,
      married: true,
      dependents: [8, 12],
      pre_cut: { household_net_income: 38000, wv_income_tax: 1200, income_tax: 0 },
      current_law: { household_net_income: 38500, wv_income_tax: 700, income_tax: 0 },
      net_income_change: 500,
      wv_tax_change: -500,
      chart: {
        income_range: [0, 40000, 200000],
        net_income_change: [0, 500, 0],
        state_tax_change: [0, -500, 0],
        federal_tax_change: [0, 0, 0],
      },
    },
  ],
};

/**
 * The Public API's calculated household for the page's default household
 * ($50,000, chart up to $100,000): net income rises by $250 at $50,000.
 * `revertsCut` is true for the baseline, which reverts SB 392's cut.
 */
function calculatedHousehold(revertsCut: boolean) {
  return {
    people: { you: { employment_income: { '2026': [0, 50000, 100000] } } },
    tax_units: {
      'your tax unit': {
        income_tax: { '2026': [0, 3000, 9000] },
        wv_income_tax: {
          '2026': revertsCut ? [0, 2000, 5000] : [0, 1750, 4600],
        },
      },
    },
    households: {
      'your household': {
        household_net_income: {
          '2026': revertsCut ? [0, 40000, 70000] : [0, 40250, 70400],
        },
      },
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tooManyRequests(): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * Serves the example households, and answers each household calculation
 * with `answerCalculation`.
 */
function stubFetch(answerCalculation: (revertsCut: boolean) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/data/example_households.json')) {
        return jsonResponse(200, examplePayload);
      }
      if (url === DASHBOARD_API_CALCULATE_URL) {
        const body = JSON.parse(String(init.body)) as { policy?: unknown };
        return answerCalculation(body.policy !== undefined);
      }
      throw new Error(`Unexpected request to ${url}`);
    }),
  );
}

const queryClient = new QueryClient();

function renderHouseholdImpactTab(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Household impact' }));
}

beforeAll(() => {
  // jsdom does not scroll; the page scrolls an example's results into view.
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
  pauseHouseholdCalculations(0);
});

describe('HouseholdImpactTab after a rate-limit refusal', () => {
  it("keeps an example's results on screen when the next calculation is refused", async () => {
    stubFetch(() => tooManyRequests());
    renderHouseholdImpactTab();
    fireEvent.click(
      await screen.findByRole('button', { name: /Married couple with two children/ }),
    );
    expect(await screen.findByText('$40,000')).toBeInTheDocument();

    // The reader changes the income and calculates; the firewall refuses it.
    fireEvent.change(screen.getByDisplayValue('40,000'), {
      target: { value: '90,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    expect(
      await screen.findByText('The results below are for the household shown before.'),
    ).toBeInTheDocument();
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(screen.queryByText('$90,000')).not.toBeInTheDocument();
    // The status line under the button says why the page waits.
    expect(
      screen.getByText(
        /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\. This page can calculate again in \d+ s\.$/,
      ),
    ).toBeInTheDocument();
  });

  it('highlights the range of the answer on screen after a refused change of range', async () => {
    let refuseCalculations = false;
    stubFetch((revertsCut) =>
      refuseCalculations
        ? tooManyRequests()
        : jsonResponse(200, {
            status: 'ok',
            message: null,
            result: calculatedHousehold(revertsCut),
          }),
    );
    renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    expect(await screen.findByText('+$250/year')).toBeInTheDocument();

    refuseCalculations = true;
    fireEvent.click(screen.getByRole('button', { name: '$1M' }));

    await screen.findByText(/This page can calculate again in \d+ s\./);
    expect(screen.getByText('+$250/year')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$100k' })).toHaveClass('bg-primary-500');
    expect(screen.getByRole('button', { name: '$1M' })).not.toHaveClass('bg-primary-500');
  });
});
