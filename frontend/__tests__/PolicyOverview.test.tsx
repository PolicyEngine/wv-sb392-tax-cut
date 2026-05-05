import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PolicyOverview from '../components/PolicyOverview';

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

describe('PolicyOverview', () => {
  it('renders without errors', () => {
    render(<PolicyOverview />);
    expect(screen.getByText('West Virginia SB 392 income tax cut')).toBeInTheDocument();
  });

  it('displays the WV income tax rate changes', () => {
    render(<PolicyOverview />);
    expect(screen.getByText('2026 rate change (single, joint, head-of-household, surviving spouse)')).toBeInTheDocument();
    expect(screen.getByText('Taxable income')).toBeInTheDocument();
    expect(screen.getByText('2.22%')).toBeInTheDocument();
    expect(screen.getByText('4.58%')).toBeInTheDocument();
  });

  it('shows sources links', () => {
    render(<PolicyOverview />);
    expect(screen.getByText('Enrolled bill text')).toBeInTheDocument();
    expect(screen.getByText('W. Va. Code §11-21-4j')).toBeInTheDocument();
    expect(screen.getByText('policyengine')).toBeInTheDocument();
  });
});
