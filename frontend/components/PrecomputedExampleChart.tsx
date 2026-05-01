'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartWatermark from './ChartWatermark';

interface ChartArrays {
  income_range: number[];
  net_income_change: number[];
  state_tax_change: number[];
  federal_tax_change: number[];
}

interface Props {
  label: string;
  income: number;
  chart: ChartArrays;
  /** Federal-tax-change at the user's income point (precomputed). */
  federalTaxAtIncome: number;
  /** WV-tax-change at the user's income point (precomputed). */
  stateTaxAtIncome: number;
  /** Net income change at the user's income point (precomputed). */
  netIncomeChangeAtIncome: number;
}

const fmtCurrency = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const fmtSigned = (v: number) => {
  const base = fmtCurrency(Math.abs(v));
  if (v > 0) return `+${base}`;
  if (v < 0) return `-${base}`;
  return base;
};
const fmtIncome = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1000).toFixed(0)}k`;
};

function MetricCard({
  label,
  value,
  lowerIsBetter = false,
}: {
  label: string;
  value: number;
  lowerIsBetter?: boolean;
}) {
  const beneficial = lowerIsBetter ? value < 0 : value > 0;
  const harmful = lowerIsBetter ? value > 0 : value < 0;
  return (
    <div
      className={`rounded-lg p-4 border ${
        beneficial
          ? 'bg-green-50 border-success'
          : harmful
            ? 'bg-red-50 border-red-300'
            : 'bg-gray-50 border-gray-300'
      }`}
    >
      <p className="text-xs text-gray-700 mb-1">{label}</p>
      <p
        className={`text-xl font-bold ${
          beneficial ? 'text-green-600' : harmful ? 'text-red-600' : 'text-gray-600'
        }`}
      >
        {value !== 0 ? `${fmtSigned(value)}/year` : '$0/year'}
      </p>
    </div>
  );
}

export default function PrecomputedExampleChart({
  label,
  income,
  chart,
  federalTaxAtIncome,
  stateTaxAtIncome,
  netIncomeChangeAtIncome,
}: Props) {
  const data = chart.income_range.map((inc, i) => ({
    income: inc,
    netIncomeChange: chart.net_income_change[i],
    stateTaxChange: chart.state_tax_change[i],
    federalTaxChange: chart.federal_tax_change[i],
  }));

  return (
    <div className="space-y-5 mt-4 rounded-2xl border border-gray-200 bg-white px-5 py-5">
      <div>
        <h4 className="text-base font-semibold text-gray-900">
          {label} — net income chart
        </h4>
        <p className="text-xs text-gray-500 mt-0.5">
          Change in net income from the WV SB 392 income tax cut, by employment
          income. Chart loaded from precomputed values.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard
          label="Federal tax change"
          value={federalTaxAtIncome}
          lowerIsBetter
        />
        <MetricCard
          label="West Virginia state tax change"
          value={stateTaxAtIncome}
          lowerIsBetter
        />
        <MetricCard
          label="Net income change"
          value={netIncomeChangeAtIncome}
        />
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={data}
          margin={{ left: 20, right: 20, top: 5, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey="income"
            type="number"
            tickFormatter={fmtIncome}
            stroke="var(--chart-reference)"
            domain={[0, data[data.length - 1].income]}
          />
          <YAxis
            tickFormatter={fmtCurrency}
            stroke="var(--chart-reference)"
            width={80}
          />
          <Tooltip
            content={({ active, payload, label: l }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div
                  style={{
                    background: 'var(--chart-tooltip-bg, #fff)',
                    border: '1px solid var(--chart-tooltip-border, #e5e7eb)',
                    borderRadius: 4,
                    padding: '8px 12px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
                    Income:{' '}
                    {fmtCurrency(
                      Math.round(((l as number) ?? p.income) / 100) * 100,
                    )}
                  </p>
                  <p style={{ margin: 0 }}>
                    Federal tax change: {fmtSigned(p.federalTaxChange)}
                  </p>
                  <p style={{ margin: 0 }}>
                    West Virginia state tax change:{' '}
                    {fmtSigned(p.stateTaxChange)}
                  </p>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Net income change: {fmtSigned(p.netIncomeChange)}
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            y={0}
            stroke="var(--chart-reference)"
            strokeWidth={2}
          />
          <ReferenceLine
            x={income}
            stroke="var(--chart-reference)"
            strokeDasharray="4 4"
            label={{
              value: `Profile: ${fmtIncome(income)}`,
              position: 'top',
              fontSize: 11,
              fill: 'var(--chart-axis-label, #6b7280)',
            }}
          />
          <Line
            type="monotone"
            dataKey="netIncomeChange"
            stroke="var(--chart-positive)"
            strokeWidth={3}
            name="Net income change"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartWatermark />
    </div>
  );
}
