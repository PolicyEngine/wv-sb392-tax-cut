'use client';

export default function PolicyOverview() {
  return (
    <div className="space-y-10">
      {/* Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          West Virginia SB 392 income tax cut
        </h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-4">
          <p className="text-sm leading-6 text-gray-700">
            West Virginia&apos;s Senate Bill 392 (2026 Regular Session), signed
            into law on March 14, 2026 and effective for taxable years
            beginning on or after January 1, 2026, cuts every marginal rate
            in the personal income tax by roughly 5% under W. Va. Code
            §11-21-4j. The cut applies to single, joint, head-of-household,
            surviving spouse, and married-filing-separately schedules; the
            bracket thresholds ($0 / $10k / $25k / $40k / $60k for most
            filers, halved for married filing separately) are unchanged from
            2025. This dashboard isolates the impact of the cut by comparing
            current law (post-cut rates) to the rates that would have applied
            if 2025 values had remained in force, for tax year 2026 &mdash;
            positive numbers mean households gain because of SB 392.
          </p>
        </div>
      </div>

      {/* Parameter changes table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          2026 rate change (single, joint, head-of-household, surviving spouse)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Taxable income</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">2026 pre-bill</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">2026 post-bill</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$0 &ndash; $10,000</td>
                <td className="py-3 px-4 text-right text-gray-700">2.22%</td>
                <td className="py-3 px-4 text-right text-gray-700">2.11%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">&minus;0.11 pp</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$10,000 &ndash; $25,000</td>
                <td className="py-3 px-4 text-right text-gray-700">2.96%</td>
                <td className="py-3 px-4 text-right text-gray-700">2.81%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">&minus;0.15 pp</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$25,000 &ndash; $40,000</td>
                <td className="py-3 px-4 text-right text-gray-700">3.33%</td>
                <td className="py-3 px-4 text-right text-gray-700">3.16%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">&minus;0.17 pp</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$40,000 &ndash; $60,000</td>
                <td className="py-3 px-4 text-right text-gray-700">4.44%</td>
                <td className="py-3 px-4 text-right text-gray-700">4.22%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">&minus;0.22 pp</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Over $60,000</td>
                <td className="py-3 px-4 text-right text-gray-700">4.82%</td>
                <td className="py-3 px-4 text-right text-gray-700">4.58%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">&minus;0.24 pp</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">
            Married filing separately uses the same rates with thresholds
            halved ($5,000 / $12,500 / $20,000 / $30,000).
          </p>
        </div>
      </div>

      {/* References */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">References</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">
              SB 392 (2026 Regular Session)
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <a
                  href="https://www.wvlegislature.gov/Bill_Text_HTML/2026_SESSIONS/RS/bills/sb392%20sub1%20enr.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Enrolled bill text
                </a>
              </li>
              <li>
                <a
                  href="https://code.wvlegislature.gov/11-21-4J/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  W. Va. Code §11-21-4j
                </a>
              </li>
            </ul>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">
              West Virginia individual income tax
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <a
                  href="https://tax.wv.gov/Documents/PIT/2025/it140.PersonalIncomeTaxFormsAndInstructions.2025.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  2025 IT-140 instructions and rate schedules
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/PolicyEngine/policyengine-us/pull/7919"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  PolicyEngine-US PR #7919 (rate update)
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
