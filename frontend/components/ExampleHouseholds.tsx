'use client';

import { useEffect, useState } from 'react';

interface ExampleHousehold {
  label: string;
  income: number;
  age_head: number;
  married: boolean;
  dependents: number[];
  pre_cut: {
    household_net_income: number;
    wv_income_tax: number;
    income_tax: number;
  };
  current_law: {
    household_net_income: number;
    wv_income_tax: number;
    income_tax: number;
  };
  net_income_change: number;
  wv_tax_change: number;
}

interface Payload {
  year: number;
  households: ExampleHousehold[];
}

const fmtCurrency = (v: number) =>
  `$${Math.round(v).toLocaleString('en-US')}`;

const fmtSigned = (v: number) => {
  const base = fmtCurrency(Math.abs(v));
  if (v > 0) return `+${base}`;
  if (v < 0) return `-${base}`;
  return base;
};

export default function ExampleHouseholds() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const basePath =
      process.env.NEXT_PUBLIC_BASE_PATH !== undefined
        ? process.env.NEXT_PUBLIC_BASE_PATH
        : '/us/wv-sb392-tax-cut';
    fetch(`${basePath}/data/example_households.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json();
      })
      .then((j: Payload) => setData(j))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return null;
  if (!data) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Example households
      </h3>
      <p className="text-sm text-gray-600 mb-3">
        Net income change for {data.year} under SB 392 vs. pre-cut (2025) rates,
        for a few representative West Virginia households.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.households.map((h, i) => {
          const isGain = h.net_income_change > 0;
          return (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                isGain
                  ? 'bg-green-50 border-success'
                  : h.net_income_change < 0
                    ? 'bg-red-50 border-red-300'
                    : 'bg-gray-50 border-gray-300'
              }`}
            >
              <p className="text-sm font-semibold text-gray-800">{h.label}</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  isGain
                    ? 'text-green-600'
                    : h.net_income_change < 0
                      ? 'text-red-600'
                      : 'text-gray-600'
                }`}
              >
                {fmtSigned(h.net_income_change)}/year
              </p>
              <p className="text-xs text-gray-500 mt-2 leading-5">
                West Virginia tax: {fmtCurrency(h.pre_cut.wv_income_tax)} →{' '}
                {fmtCurrency(h.current_law.wv_income_tax)}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500 italic mt-2">
        Single filers use the standard deduction. Married couples file jointly
        with the spouse aged 35. Dependents have the listed ages. Numbers
        reflect the household&apos;s combined federal + state tax change; the
        secondary line shows the West Virginia state portion only.
      </p>
    </div>
  );
}
