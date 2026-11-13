import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import Home from '../app/(shell)/page';
import {
  pauseHouseholdCalculations,
  rememberShownHouseholdRequest,
} from '../hooks/useHouseholdImpact';
import { api } from '../lib/api';

// Without a measured size Recharts draws nothing, so the x-axis becomes an
// element that shows its range and the other chart parts draw nothing;
// these tests read the page's text and buttons.
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
 * with `answerCalculation`. Returns the calculations it receives.
 */
function stubFetch(
  answerCalculation: (revertsCut: boolean) => Response,
): unknown[] {
  const calculations: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/data/example_households.json')) {
        return jsonResponse(200, examplePayload);
      }
      if (url === DASHBOARD_API_CALCULATE_URL) {
        const body = JSON.parse(String(init.body)) as { policy?: unknown };
        calculations.push(body);
        return answerCalculation(body.policy !== undefined);
      }
      throw new Error(`Unexpected request to ${url}`);
    }),
  );
  return calculations;
}

function calculatedAnswer(revertsCut: boolean): Response {
  return jsonResponse(200, {
    status: 'ok',
    message: null,
    result: calculatedHousehold(revertsCut),
  });
}

/** Chooses the example household, then calculates it at $90,000. */
async function calculateExampleAtHigherIncome(): Promise<HTMLElement> {
  const exampleCard = await screen.findByRole('button', {
    name: /Married couple with two children/,
  });
  fireEvent.click(exampleCard);
  expect(await screen.findByText('$40,000')).toBeInTheDocument();
  fireEvent.change(screen.getByDisplayValue('40,000'), {
    target: { value: '90,000' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
  return exampleCard;
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
  // Each test starts with no answer recorded as shown.
  rememberShownHouseholdRequest(queryClient, null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    // The status line under the button says when the page can calculate
    // again.
    expect(screen.getByText(/This page can calculate again in \d+ s\./)).toBeInTheDocument();
  });

  it('announces the shared limit once, without the countdown', async () => {
    // A live region is read again whenever its text changes, and the
    // countdown changes every second.
    const announcedExplanation =
      'Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute.';
    let refuseCalculations = true;
    stubFetch((revertsCut) =>
      refuseCalculations ? tooManyRequests() : calculatedAnswer(revertsCut),
    );
    renderHouseholdImpactTab();

    // With nothing shown before, the refusal is shown in place of results.
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    expect(
      await screen.findByText(/This page can calculate again in \d+ s\./),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toEqual([
      announcedExplanation,
    ]);

    // After the minute, a household is calculated; the next one is refused,
    // and the earlier answer stays on screen with the notice above it.
    act(() => pauseHouseholdCalculations(0));
    refuseCalculations = false;
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    expect(await screen.findByText('+$250/year')).toBeInTheDocument();
    refuseCalculations = true;
    fireEvent.change(screen.getByDisplayValue('50,000'), {
      target: { value: '90,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    expect(
      await screen.findByText('The results below are for the household shown before.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toEqual([
      announcedExplanation,
    ]);
  });

  it("keeps an example's card selected while its results stay after a refusal", async () => {
    stubFetch(() => tooManyRequests());
    renderHouseholdImpactTab();

    const exampleCard = await calculateExampleAtHigherIncome();

    expect(
      await screen.findByText('The results below are for the household shown before.'),
    ).toBeInTheDocument();
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(exampleCard).toHaveClass('ring-2');
  });

  it('rescales a shown example with the x-axis buttons, without calculating', async () => {
    const calculations = stubFetch(() => tooManyRequests());
    renderHouseholdImpactTab();
    const exampleCard = await screen.findByRole('button', {
      name: /Married couple with two children/,
    });
    fireEvent.click(exampleCard);
    expect(await screen.findByText('$40,000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '$500k' }));

    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-domain', '[0,500000]');
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$500k' })).toHaveClass('bg-primary-500');
    expect(exampleCard).toHaveClass('ring-2');
    expect(calculations).toEqual([]);
  });

  it('rescales a shown example with the x-axis buttons during a pause, without calculating', async () => {
    stubFetch(() => tooManyRequests());
    const calculateHouseholdImpact = vi.spyOn(api, 'calculateHouseholdImpact');
    renderHouseholdImpactTab();
    const exampleCard = await screen.findByRole('button', {
      name: /Married couple with two children/,
    });
    fireEvent.click(exampleCard);
    expect(await screen.findByText('$40,000')).toBeInTheDocument();
    // Another calculation from the same network met the shared limit.
    act(() => pauseHouseholdCalculations());

    // Drawing the example on a new range sends nothing, so the pause does
    // not stop it.
    const widerRangeButton = screen.getByRole('button', { name: '$500k' });
    expect(widerRangeButton).toBeEnabled();
    fireEvent.click(widerRangeButton);

    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-domain', '[0,500000]');
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(widerRangeButton).toHaveClass('bg-primary-500');
    expect(exampleCard).toHaveClass('ring-2');
    expect(calculateHouseholdImpact).not.toHaveBeenCalled();
  });

  it('rescales an example kept after a refusal with the x-axis buttons, without calculating', async () => {
    const calculations = stubFetch(() => tooManyRequests());
    renderHouseholdImpactTab();
    const exampleCard = await calculateExampleAtHigherIncome();
    await screen.findByText('The results below are for the household shown before.');
    const calculationsSent = calculations.length;
    // The minute passes.
    act(() => pauseHouseholdCalculations(0));

    fireEvent.click(screen.getByRole('button', { name: '$500k' }));

    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-domain', '[0,500000]');
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$500k' })).toHaveClass('bg-primary-500');
    expect(exampleCard).toHaveClass('ring-2');
    expect(calculations).toHaveLength(calculationsSent);
  });

  it('shows a refusal itself after the household tab is opened again', async () => {
    // Leaving the tab and coming back empties the results area, so a later
    // refusal must not bring the earlier answer back.
    let refuseCalculations = false;
    stubFetch((revertsCut) =>
      refuseCalculations ? tooManyRequests() : calculatedAnswer(revertsCut),
    );
    renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    expect(await screen.findByText('+$250/year')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Policy overview' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Household impact' }));

    refuseCalculations = true;
    fireEvent.change(screen.getByDisplayValue('50,000'), {
      target: { value: '90,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    expect(
      await screen.findByText('Household calculator temporarily unavailable'),
    ).toBeInTheDocument();
    expect(screen.queryByText('+$250/year')).not.toBeInTheDocument();
    expect(screen.queryByText('$50,000')).not.toBeInTheDocument();
  });

  it('highlights the range of the answer on screen after a refused change of range', async () => {
    let refuseCalculations = false;
    stubFetch((revertsCut) =>
      refuseCalculations ? tooManyRequests() : calculatedAnswer(revertsCut),
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

describe('HouseholdImpactTab after a 504', () => {
  it("shows the page's own message, without the note about the API being updated", async () => {
    // The error panel shows that note when the message contains "500".
    stubFetch(() =>
      jsonResponse(504, {
        status: 'error',
        message: 'The Public API did not answer in time.',
        result: null,
      }),
    );
    renderHouseholdImpactTab();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));

    await waitFor(() =>
      expect(
        screen.queryByText(
          "PolicyEngine's calculation service did not answer in time (HTTP 504). " +
            'Try again in a few minutes.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/being updated/)).not.toBeInTheDocument();
  });
});
