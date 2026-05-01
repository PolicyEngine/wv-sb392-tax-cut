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
        "label": "Single filer, $60k",
        "income": 60_000,
        "age_head": 35,
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
        "label": "Married couple, $100k, 2 kids",
        "income": 100_000,
        "age_head": 40,
        "married": True,
        "dependents": [8, 10],
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


def build_household(profile: dict) -> dict:
    """Build a PolicyEngine household situation for the given profile."""
    year = str(YEAR)
    people: dict = {
        "you": {
            "age": {year: profile["age_head"]},
            "employment_income": {year: profile["income"]},
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

    return {
        "people": people,
        "families": {"your family": {"members": members}},
        "marital_units": marital_units,
        "spm_units": {"your household": {"members": members}},
        "tax_units": {
            "your tax unit": {
                "members": members,
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
    """Run baseline (revert applied = pre-cut) and reform (current law)
    for one profile and return the diff alongside the inputs."""
    situation = build_household(profile)
    pre_cut = extract(calc(situation, revert_policy()))
    current = extract(calc(situation, None))
    return {
        **profile,
        "pre_cut": pre_cut,
        "current_law": current,
        "net_income_change": current["household_net_income"]
        - pre_cut["household_net_income"],
        "wv_tax_change": current["wv_income_tax"] - pre_cut["wv_income_tax"],
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
