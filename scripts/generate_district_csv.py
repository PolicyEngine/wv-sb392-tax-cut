"""Generate a placeholder WV congressional-district CSV.

The Modal district pipeline is the authoritative source for production
numbers. This script is only a lightweight local fallback that writes the
same suffixed filename consumed by the frontend.
"""

import os
import random

WV_STATE_RESULT = {"avg_change": 152.0, "rel_change": 0.002}
WV_STATE = "WV"
WV_DISTRICTS = [1, 2]
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
    base_change = WV_STATE_RESULT["avg_change"]
    base_rel = WV_STATE_RESULT["rel_change"]

    for district in WV_DISTRICTS:
        variation = 1.0 + random.uniform(-0.05, 0.05)
        district_id = f"{WV_STATE}-{district:02d}"
        districts.append({
            "district": district_id,
            "average_household_income_change": round(base_change * variation, 2),
            "relative_household_income_change": round(base_rel * variation, 6),
            "winners_share": 0.69,
            "losers_share": 0.0,
            "poverty_pct_change": 0.0,
            "child_poverty_pct_change": 0.0,
            "state": WV_STATE,
            "year": YEAR,
        })

    districts.sort(key=lambda x: x["district"])

    filepath = os.path.join(output_dir, "congressional_districts_revert.csv")
    headers = [
        "district",
        "average_household_income_change",
        "relative_household_income_change",
        "winners_share",
        "losers_share",
        "poverty_pct_change",
        "child_poverty_pct_change",
        "state",
        "year",
    ]
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(",".join(headers) + "\n")
        for row in districts:
            f.write(",".join(str(row[h]) for h in headers) + "\n")

    print(f"Saved {len(districts)} WV districts to: {filepath}")


if __name__ == "__main__":
    main()
