import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ImpactAnalysis from '../components/ImpactAnalysis';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';
import { api, HouseholdCalculationError } from '../lib/api';
import type { HouseholdImpactResponse, HouseholdRequest } from '../lib/types';

// Mock ResizeObserver for Recharts
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
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

// Net income rises by $350 at $50,000, all of it from a lower West
// Virginia income tax.
const earlierAnswer: HouseholdImpactResponse = {
  income_range: [0, 50000, 100000],
  net_income_change: [0, 350, 0],
  federalTaxChange: [0, 0, 0],
  stateTaxChange: [0, -350, 0],
  netIncomeChange: [0, 350, 0],
  benefit_at_income: {
    baseline: 50000,
    reform: 50350,
    difference: 350,
    federal_tax_change: 0,
    state_tax_change: -350,
    net_income_change: 350,
  },
  x_axis_max: 100000,
};

afterEach(() => {
  vi.restoreAllMocks();
  pauseHouseholdCalculations(0);
});

describe('ImpactAnalysis', () => {
  it('shows the last answer and the notice after a rate-limit refusal', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['householdImpact', earlierRequest], earlierAnswer);
    const refusal = new HouseholdCalculationError(
      'Everyone on your network, such as a workshop or an office, shares a ' +
        'limit on calculations a minute, and it has been reached. This page ' +
        'can calculate again in a minute.',
      429,
      false,
      true,
    );
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(refusal);

    render(
      <QueryClientProvider client={queryClient}>
        <ImpactAnalysis request={householdRequest} triggered maxEarnings={100000} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(refusal.message);
    // The earlier household's income and answer, not the refused one's.
    expect(screen.getByText('$50,000')).toBeInTheDocument();
    expect(screen.getByText('+$350/year')).toBeInTheDocument();
    expect(screen.queryByText('$75,000')).not.toBeInTheDocument();
    queryClient.clear();
  });
});
