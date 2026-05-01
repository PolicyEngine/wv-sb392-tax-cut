# West Virginia SB 392 income tax cut dashboard

Models the impact of West Virginia's 2026 income tax rate cut (SB 392) on
households, statewide revenue, and the state's two congressional districts.

- **Frontend**: `frontend/` (Next.js 15 / Tailwind 4)
- **Modal pipelines**: `scripts/modal_pipeline.py` (statewide), `scripts/modal_district_pipeline.py` (per-district)
- **Pre-computed CSVs**: `frontend/public/data/*.csv`

Live: <https://wv-sb392-tax-cut.vercel.app/us/wv-sb392-tax-cut>
