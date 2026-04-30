"""Generate Utah congressional-district CSV from state-level results.

Utah has four congressional districts (UT-01..UT-04, state FIPS 49). This
script seeds the district CSV by spreading the state-level average impact
across districts with modest variation — used as a placeholder before the
full Modal district pipeline has been run.
"""

import os
import random

# Utah state-level result (placeholder magnitudes — replace with
# real pipeline output). Negative avg_change because the state-revenue
# reduction drives a small household-net-income gain distributed
# unevenly; here we show the household-side average gain.
UT_STATE_RESULT = {"avg_change": 42.00, "rel_change": 0.0006}

# Utah congressional districts (119th Congress): 4 districts.
UTAH_STATE = "UT"
UTAH_DISTRICTS = [1, 2, 3, 4]

YEAR = 2026


def main():
    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    random.seed(42)

    districts = []
    base_change = UT_STATE_RESULT["avg_change"]
    base_rel = UT_STATE_RESULT["rel_change"]

    for d in UTAH_DISTRICTS:
        # +/- 20% variation around the state average
        variation = 1.0 + random.uniform(-0.2, 0.2)
        district_change = base_change * variation
        district_rel = base_rel * variation

        district_id = f"{UTAH_STATE}-{d:02d}"

        districts.append({
            "district": district_id,
            "average_household_income_change": round(district_change, 2),
            "relative_household_income_change": round(district_rel, 6),
            "state": UTAH_STATE,
            "year": YEAR,
        })

    districts.sort(key=lambda x: x["district"])

    filepath = os.path.join(output_dir, "congressional_districts.csv")
    with open(filepath, "w") as f:
        headers = [
            "district",
            "average_household_income_change",
            "relative_household_income_change",
            "state",
            "year",
        ]
        f.write(",".join(headers) + "\n")
        for d in districts:
            row = [str(d[h]) for h in headers]
            f.write(",".join(row) + "\n")

    print(f"Saved {len(districts)} Utah districts to: {filepath}")

    avg_change = sum(d["average_household_income_change"] for d in districts) / len(districts)
    min_change = min(d["average_household_income_change"] for d in districts)
    max_change = max(d["average_household_income_change"] for d in districts)

    print("\nSummary:")
    print(f"  Total districts: {len(districts)}")
    print(f"  Avg income change: ${avg_change:,.2f}")
    print(f"  Min change: ${min_change:,.2f}")
    print(f"  Max change: ${max_change:,.2f}")


if __name__ == "__main__":
    main()
