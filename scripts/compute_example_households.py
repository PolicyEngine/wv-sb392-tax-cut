"""Pre-compute a handful of representative West Virginia households so the
policy-overview page can show example impacts without hitting the PE API
on page load.

Hits https://api.policyengine.org/us/calculate twice per profile (once
with the SB 392 revert reform applied, giving the pre-cut state; once
without, giving current law) and writes the diff into
``frontend/public/data/example_households.json``.

Usage:
    uv run scripts/compute_example_households.py
    # or, with the system Python:
    python scripts/compute_example_households.py
"""

import json
from pathlib import Path

import requests

PE_API = "https://api.policyengine.org/us/calculate"
YEAR = 2026
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "example_households.json"

# 5 sample WV households spanning the income distribution. Each profile
# describes the inputs surfaced on the page; the rest of the household
# (filing units, etc.) is built below.
PROFILES = [
    {
        "label": "Single filer, $30k",
        "income": 30_000,
        "age_head": 30,
        "married": False,
        "dependents": [],
    },
    {
        "label": "Married couple, $80k, no kids",
        "income": 80_000,
        "age_head": 35,
        "married": True,
        "dependents": [],
    },
    {
        "label": "Married couple, $150k, 2 kids",
        "income": 150_000,
        "age_head": 45,
        "married": True,
        "dependents": [12, 15],
    },
]


def revert_policy() -> dict:
    """Roll WV's 2026 rates back to 2025 values across every filing
    schedule the household calculator might land on."""
    rates = [0.0222, 0.0296, 0.0333, 0.0444, 0.0482]
    schedules = ["single", "joint", "head", "surviving_spouse", "separate"]
    period = "2026-01-01.2100-12-31"
    out: dict = {}
    for schedule in schedules:
        for i, rate in enumerate(rates):
            out[f"gov.states.wv.tax.income.rates.{schedule}[{i}].rate"] = {
                period: rate
            }
    return out


def build_household(profile: dict, with_axes: bool = False) -> dict:
    """Build a PolicyEngine household situation for the given profile.

    If ``with_axes`` is True, sweeps employment_income from $0 to a
    profile-derived max so we can pre-compute the full net-income chart.
    """
    year = str(YEAR)
    income_for_baseline = None if with_axes else profile["income"]
    people: dict = {
        "you": {
            "age": {year: profile["age_head"]},
            "employment_income": {year: income_for_baseline},
        }
    }
    members = ["you"]
    marital_units: dict = {"your marital unit": {"members": ["you"]}}

    if profile["married"]:
        people["your partner"] = {"age": {year: 35}}
        members.append("your partner")
        marital_units["your marital unit"]["members"].append("your partner")

    for i, age in enumerate(profile["dependents"]):
        cid = (
            "your first dependent"
            if i == 0
            else "your second dependent"
            if i == 1
            else f"dependent_{i + 1}"
        )
        people[cid] = {"age": {year: age}}
        members.append(cid)
        marital_units[f"{cid}'s marital unit"] = {"members": [cid]}

    situation: dict = {
        "people": people,
        "families": {"your family": {"members": members}},
        "marital_units": marital_units,
        "spm_units": {"your household": {"members": members}},
        "tax_units": {
            "your tax unit": {
                "members": members,
                "adjusted_gross_income": {year: None},
                "income_tax": {year: None},
                "wv_income_tax": {year: None},
            }
        },
        "households": {
            "your household": {
                "members": members,
                "state_code": {year: "WV"},
                "household_net_income": {year: None},
            }
        },
    }

    if with_axes:
        axis_max = max(profile["income"] * 2, 100_000)
        situation["axes"] = [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": axis_max,
                    "count": 201,
                    "period": year,
                    "target": "person",
                }
            ]
        ]
    return situation


def calc(situation: dict, policy: dict | None) -> dict:
    """Hit the PE /us/calculate endpoint with optional policy overrides."""
    body: dict = {"household": situation}
    if policy:
        body["policy"] = policy
    response = requests.post(
        PE_API, json=body, headers={"Content-Type": "application/json"}, timeout=120
    )
    response.raise_for_status()
    return response.json()["result"]


def extract(result: dict) -> dict:
    """Pull the scalar metrics we want to surface on the page."""
    yr = str(YEAR)
    hh = result["households"]["your household"]
    tu = result["tax_units"]["your tax unit"]
    return {
        "household_net_income": hh["household_net_income"][yr],
        "wv_income_tax": tu["wv_income_tax"][yr],
        "income_tax": tu["income_tax"][yr],
    }


def compute_profile(profile: dict) -> dict:
    """Run baseline (revert = pre-cut) and reform (current law) for one
    profile, both at the user's income point and as an income sweep, so
    the page can render the full net-income chart instantly."""
    yr = str(YEAR)

    # Point estimate (single income).
    point_situation = build_household(profile, with_axes=False)
    pre_cut = extract(calc(point_situation, revert_policy()))
    current = extract(calc(point_situation, None))

    # Income sweep — only what the chart actually uses.
    sweep_situation = build_household(profile, with_axes=True)
    pre_sweep = calc(sweep_situation, revert_policy())
    cur_sweep = calc(sweep_situation, None)

    income_range = pre_sweep["people"]["you"]["employment_income"][yr]
    pre_net = pre_sweep["households"]["your household"]["household_net_income"][yr]
    cur_net = cur_sweep["households"]["your household"]["household_net_income"][yr]
    pre_state = pre_sweep["tax_units"]["your tax unit"]["wv_income_tax"][yr]
    cur_state = cur_sweep["tax_units"]["your tax unit"]["wv_income_tax"][yr]
    pre_fed = pre_sweep["tax_units"]["your tax unit"]["income_tax"][yr]
    cur_fed = cur_sweep["tax_units"]["your tax unit"]["income_tax"][yr]

    net_income_change = [c - p for c, p in zip(cur_net, pre_net)]
    state_tax_change = [c - p for c, p in zip(cur_state, pre_state)]
    federal_tax_change = [c - p for c, p in zip(cur_fed, pre_fed)]

    return {
        **profile,
        "pre_cut": pre_cut,
        "current_law": current,
        "net_income_change": current["household_net_income"]
        - pre_cut["household_net_income"],
        "wv_tax_change": current["wv_income_tax"] - pre_cut["wv_income_tax"],
        "chart": {
            "income_range": income_range,
            "net_income_change": net_income_change,
            "state_tax_change": state_tax_change,
            "federal_tax_change": federal_tax_change,
        },
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for profile in PROFILES:
        print(f"  Computing: {profile['label']}...")
        rows.append(compute_profile(profile))

    with OUTPUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump({"year": YEAR, "households": rows}, fh, indent=2)
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
