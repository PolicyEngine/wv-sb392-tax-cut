"""Modal-based state-level data generation pipeline for the West Virginia
SB 392 tax-cut dashboard.

The 2026 cut (PR #7919 in policyengine-us) is in PolicyEngine's baseline
parameters. To show the *impact* of the cut, we run two simulations:

    sim_pre_cut = WV with 2025 rates extended into 2026 (apply our revert reform)
    sim_current = WV current law (post-cut rates, no reform)

Impact reported throughout = current law - pre-cut, so a positive net
income change means households gain because of the tax cut.

Usage:
    modal run scripts/modal_pipeline.py
"""

import json
import os
from pathlib import Path

import modal


app = modal.App("wv-sb392-tax-cut-pipeline")

_REPO_ROOT = Path(__file__).resolve().parent.parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "policyengine-us>=1.665.0",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "huggingface_hub",
    )
    # Ship the canonical revert-reform JSON into the worker image so the
    # worker can load it at runtime (Modal otherwise only sees the script
    # dir).
    .add_local_file(_REPO_ROOT / "reform_revert.json", "/reforms/reform_revert.json")
)

YEAR = 2026
WV_DATASET = "hf://policyengine/policyengine-us-data/states/WV.h5"
VARIANT = "revert"


def _load_reform() -> dict:
    """Load the revert-reform JSON. Tries the in-image path first, falls
    back to the local repo path so this also works when invoked outside
    Modal (e.g., from a notebook)."""
    in_image = Path("/reforms/reform_revert.json")
    if in_image.exists():
        path = in_image
    else:
        path = Path(__file__).resolve().parent.parent / "reform_revert.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.pop("_comment", None)
    return data


def _build_reform_from_overrides(overrides: dict):
    """Build a Reform that supports ``brackets[N]`` index syntax in paths.

    PolicyEngine's stock ``Reform.from_dict`` cannot navigate parameter
    paths with array-index segments, so we walk the parameter tree
    manually for any ``name[N]`` segment.
    """
    import re
    from policyengine_core.reforms import Reform
    from policyengine_core.periods import instant

    def modify(parameters):
        for path, periods in overrides.items():
            node = parameters
            for segment in path.split("."):
                match = re.match(r"(\w+)\[(\d+)\]", segment)
                if match:
                    node = getattr(node, match.group(1))[int(match.group(2))]
                else:
                    node = getattr(node, segment)
            for period_str, value in periods.items():
                if "." in period_str and len(period_str) > 10:
                    start_str, stop_str = period_str.split(".")
                else:
                    start_str = (
                        period_str if "-" in period_str else f"{period_str}-01-01"
                    )
                    stop_str = "2100-12-31"
                node.update(
                    start=instant(start_str), stop=instant(stop_str), value=value
                )
        return parameters

    class _JsonReform(Reform):
        def apply(self):
            self.modify_parameters(modify)

    return _JsonReform


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=1,
)
def calculate() -> dict:
    """Run the WV state-level microsim and return distributional, fiscal,
    poverty, and bracket breakdowns under the SB 392 tax cut."""
    import numpy as np
    from policyengine_us import Microsimulation

    print(f"Starting WV SB 392 tax-cut calculation for {YEAR}...")

    intra_bounds = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
    intra_labels = [
        "Lose more than 5%",
        "Lose less than 5%",
        "No change",
        "Gain less than 5%",
        "Gain more than 5%",
    ]

    revert = _build_reform_from_overrides(_load_reform())

    # Baseline = pre-cut (revert applied). Reform = current law (no override).
    print("  Loading pre-cut sim on WV dataset (baseline = revert)...")
    sim_baseline = Microsimulation(dataset=WV_DATASET, reform=revert)
    print("  Loading current-law sim on WV dataset (reform = current law)...")
    sim_reform = Microsimulation(dataset=WV_DATASET)

    # ===== FISCAL IMPACT =====
    wv_baseline = sim_baseline.calculate("wv_income_tax", period=YEAR, map_to="household")
    wv_reform = sim_reform.calculate("wv_income_tax", period=YEAR, map_to="household")
    state_tax_revenue_impact = float((wv_reform - wv_baseline).sum())

    fed_baseline = sim_baseline.calculate("income_tax", period=YEAR, map_to="household")
    fed_reform = sim_reform.calculate("income_tax", period=YEAR, map_to="household")
    federal_tax_revenue_impact = float((fed_reform - fed_baseline).sum())

    tax_revenue_impact = federal_tax_revenue_impact + state_tax_revenue_impact
    budgetary_impact = tax_revenue_impact

    baseline_net_income = sim_baseline.calculate(
        "household_net_income", period=YEAR, map_to="household"
    )
    reform_net_income = sim_reform.calculate(
        "household_net_income", period=YEAR, map_to="household"
    )
    income_change = reform_net_income - baseline_net_income

    total_households = float((income_change * 0 + 1).sum())
    winners = float((income_change > 1).sum())
    losers = float((income_change < -1).sum())
    beneficiaries = float((income_change > 0).sum())

    affected = abs(income_change) > 1
    affected_count = float(affected.sum())
    avg_benefit = (
        float(income_change[affected].sum() / affected.sum())
        if affected_count > 0
        else 0.0
    )
    winners_rate = winners / total_households * 100 if total_households else 0.0
    losers_rate = losers / total_households * 100 if total_households else 0.0

    # ===== INCOME DECILE =====
    decile = sim_baseline.calculate(
        "household_income_decile", period=YEAR, map_to="household"
    )
    decile_average = {}
    decile_relative = {}
    for d in range(1, 11):
        dmask = decile == d
        d_count = float(dmask.sum())
        if d_count > 0:
            d_baseline_sum = float(baseline_net_income[dmask].sum())
            d_change_sum = float(income_change[dmask].sum())
            decile_average[str(d)] = d_change_sum / d_count
            decile_relative[str(d)] = (
                d_change_sum / d_baseline_sum if d_baseline_sum != 0 else 0.0
            )
        else:
            decile_average[str(d)] = 0.0
            decile_relative[str(d)] = 0.0

    household_weight = sim_reform.calculate("household_weight", period=YEAR)
    people_per_hh = sim_baseline.calculate(
        "household_count_people", period=YEAR, map_to="household"
    )
    capped_baseline = np.maximum(np.array(baseline_net_income), 1)
    rel_change_arr = np.array(income_change) / capped_baseline

    decile_arr = np.array(decile)
    weight_arr = np.array(household_weight)
    people_weighted = np.array(people_per_hh) * weight_arr

    intra_decile_deciles = {label: [] for label in intra_labels}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_people = people_weighted[dmask]
        d_total_people = d_people.sum()
        d_rel = rel_change_arr[dmask]
        for lower, upper, label in zip(
            intra_bounds[:-1], intra_bounds[1:], intra_labels
        ):
            in_group = (d_rel > lower) & (d_rel <= upper)
            proportion = (
                float(d_people[in_group].sum() / d_total_people)
                if d_total_people > 0
                else 0.0
            )
            intra_decile_deciles[label].append(proportion)
    intra_decile_all = {
        label: sum(intra_decile_deciles[label]) / 10 for label in intra_labels
    }

    # ===== POVERTY =====
    pov_bl = sim_baseline.calculate("in_poverty", period=YEAR, map_to="person")
    pov_rf = sim_reform.calculate("in_poverty", period=YEAR, map_to="person")
    poverty_baseline_rate = float(pov_bl.mean() * 100)
    poverty_reform_rate = float(pov_rf.mean() * 100)
    poverty_rate_change = poverty_reform_rate - poverty_baseline_rate
    poverty_percent_change = (
        poverty_rate_change / poverty_baseline_rate * 100
        if poverty_baseline_rate > 0
        else 0.0
    )

    age_arr = np.array(sim_baseline.calculate("age", period=YEAR))
    is_child = age_arr < 18
    pw_arr = np.array(sim_baseline.calculate("person_weight", period=YEAR))
    child_w = pw_arr[is_child]
    total_child_w = child_w.sum()

    pov_bl_arr = np.array(pov_bl).astype(bool)
    pov_rf_arr = np.array(pov_rf).astype(bool)

    def _child_rate(arr):
        return (
            float((arr[is_child] * child_w).sum() / total_child_w * 100)
            if total_child_w > 0
            else 0.0
        )

    child_poverty_baseline_rate = _child_rate(pov_bl_arr)
    child_poverty_reform_rate = _child_rate(pov_rf_arr)
    child_poverty_rate_change = (
        child_poverty_reform_rate - child_poverty_baseline_rate
    )
    child_poverty_percent_change = (
        child_poverty_rate_change / child_poverty_baseline_rate * 100
        if child_poverty_baseline_rate > 0
        else 0.0
    )

    deep_bl = sim_baseline.calculate("in_deep_poverty", period=YEAR, map_to="person")
    deep_rf = sim_reform.calculate("in_deep_poverty", period=YEAR, map_to="person")
    deep_poverty_baseline_rate = float(deep_bl.mean() * 100)
    deep_poverty_reform_rate = float(deep_rf.mean() * 100)
    deep_poverty_rate_change = deep_poverty_reform_rate - deep_poverty_baseline_rate
    deep_poverty_percent_change = (
        deep_poverty_rate_change / deep_poverty_baseline_rate * 100
        if deep_poverty_baseline_rate > 0
        else 0.0
    )

    deep_bl_arr = np.array(deep_bl).astype(bool)
    deep_rf_arr = np.array(deep_rf).astype(bool)
    deep_child_poverty_baseline_rate = _child_rate(deep_bl_arr)
    deep_child_poverty_reform_rate = _child_rate(deep_rf_arr)
    deep_child_poverty_rate_change = (
        deep_child_poverty_reform_rate - deep_child_poverty_baseline_rate
    )
    deep_child_poverty_percent_change = (
        deep_child_poverty_rate_change / deep_child_poverty_baseline_rate * 100
        if deep_child_poverty_baseline_rate > 0
        else 0.0
    )

    # ===== INCOME BRACKETS =====
    agi = sim_baseline.calculate(
        "adjusted_gross_income", period=YEAR, map_to="household"
    )
    agi_arr = np.array(agi)
    change_arr = np.array(income_change)
    affected_mask = np.abs(change_arr) > 1

    income_brackets = [
        (0, 25_000, "$0 - $25k"),
        (25_000, 50_000, "$25k - $50k"),
        (50_000, 75_000, "$50k - $75k"),
        (75_000, 100_000, "$75k - $100k"),
        (100_000, 150_000, "$100k - $150k"),
        (150_000, 200_000, "$150k - $200k"),
        (200_000, float("inf"), "$200k+"),
    ]
    by_income_bracket = []
    for min_inc, max_inc, label in income_brackets:
        mask = (agi_arr >= min_inc) & (agi_arr < max_inc) & affected_mask
        bracket_affected = float(weight_arr[mask].sum())
        if bracket_affected > 0:
            bracket_cost = float((change_arr[mask] * weight_arr[mask]).sum())
            bracket_avg = float(np.average(change_arr[mask], weights=weight_arr[mask]))
        else:
            bracket_cost = 0.0
            bracket_avg = 0.0
        by_income_bracket.append({
            "bracket": label,
            "beneficiaries": bracket_affected,
            "total_cost": bracket_cost,
            "avg_benefit": bracket_avg,
        })

    print("  WV calculation done.")
    return {
        "variant": VARIANT,
        "year": YEAR,
        "budget": {
            "budgetary_impact": budgetary_impact,
            "federal_tax_revenue_impact": federal_tax_revenue_impact,
            "state_tax_revenue_impact": state_tax_revenue_impact,
            "tax_revenue_impact": tax_revenue_impact,
            "households": total_households,
        },
        "decile": {"average": decile_average, "relative": decile_relative},
        "intra_decile": {"all": intra_decile_all, "deciles": intra_decile_deciles},
        "total_cost": -budgetary_impact,
        "beneficiaries": beneficiaries,
        "avg_benefit": avg_benefit,
        "winners": winners,
        "losers": losers,
        "winners_rate": winners_rate,
        "losers_rate": losers_rate,
        "poverty_baseline_rate": poverty_baseline_rate,
        "poverty_reform_rate": poverty_reform_rate,
        "poverty_rate_change": poverty_rate_change,
        "poverty_percent_change": poverty_percent_change,
        "child_poverty_baseline_rate": child_poverty_baseline_rate,
        "child_poverty_reform_rate": child_poverty_reform_rate,
        "child_poverty_rate_change": child_poverty_rate_change,
        "child_poverty_percent_change": child_poverty_percent_change,
        "deep_poverty_baseline_rate": deep_poverty_baseline_rate,
        "deep_poverty_reform_rate": deep_poverty_reform_rate,
        "deep_poverty_rate_change": deep_poverty_rate_change,
        "deep_poverty_percent_change": deep_poverty_percent_change,
        "deep_child_poverty_baseline_rate": deep_child_poverty_baseline_rate,
        "deep_child_poverty_reform_rate": deep_child_poverty_reform_rate,
        "deep_child_poverty_rate_change": deep_child_poverty_rate_change,
        "deep_child_poverty_percent_change": deep_child_poverty_percent_change,
        "by_income_bracket": by_income_bracket,
    }


def _save_csvs(result: dict, output_dir: str) -> None:
    """Write CSVs for the WV result."""
    import pandas as pd

    variant = result["variant"]
    year = result["year"]

    distributional_rows = []
    for d, avg in result["decile"]["average"].items():
        distributional_rows.append({
            "year": year,
            "decile": d,
            "average_change": round(avg, 2),
            "relative_change": round(result["decile"]["relative"][d], 6),
        })

    metrics_rows = []
    flat = [
        ("budgetary_impact", result["budget"]["budgetary_impact"]),
        ("federal_tax_revenue_impact", result["budget"]["federal_tax_revenue_impact"]),
        ("state_tax_revenue_impact", result["budget"]["state_tax_revenue_impact"]),
        ("tax_revenue_impact", result["budget"]["tax_revenue_impact"]),
        ("households", result["budget"]["households"]),
        ("total_cost", result["total_cost"]),
        ("beneficiaries", result["beneficiaries"]),
        ("avg_benefit", result["avg_benefit"]),
        ("winners", result["winners"]),
        ("losers", result["losers"]),
        ("winners_rate", result["winners_rate"]),
        ("losers_rate", result["losers_rate"]),
        ("poverty_baseline_rate", result["poverty_baseline_rate"]),
        ("poverty_reform_rate", result["poverty_reform_rate"]),
        ("poverty_rate_change", result["poverty_rate_change"]),
        ("poverty_percent_change", result["poverty_percent_change"]),
        ("child_poverty_baseline_rate", result["child_poverty_baseline_rate"]),
        ("child_poverty_reform_rate", result["child_poverty_reform_rate"]),
        ("child_poverty_rate_change", result["child_poverty_rate_change"]),
        ("child_poverty_percent_change", result["child_poverty_percent_change"]),
        ("deep_poverty_baseline_rate", result["deep_poverty_baseline_rate"]),
        ("deep_poverty_reform_rate", result["deep_poverty_reform_rate"]),
        ("deep_poverty_rate_change", result["deep_poverty_rate_change"]),
        ("deep_poverty_percent_change", result["deep_poverty_percent_change"]),
        ("deep_child_poverty_baseline_rate", result["deep_child_poverty_baseline_rate"]),
        ("deep_child_poverty_reform_rate", result["deep_child_poverty_reform_rate"]),
        ("deep_child_poverty_rate_change", result["deep_child_poverty_rate_change"]),
        ("deep_child_poverty_percent_change", result["deep_child_poverty_percent_change"]),
    ]
    for metric, value in flat:
        metrics_rows.append({"year": year, "metric": metric, "value": value})

    intra = result["intra_decile"]
    winners_losers_rows = [{
        "year": year,
        "decile": "All",
        "gain_more_5pct": intra["all"]["Gain more than 5%"],
        "gain_less_5pct": intra["all"]["Gain less than 5%"],
        "no_change": intra["all"]["No change"],
        "lose_less_5pct": intra["all"]["Lose less than 5%"],
        "lose_more_5pct": intra["all"]["Lose more than 5%"],
    }]
    for i in range(10):
        winners_losers_rows.append({
            "year": year,
            "decile": str(i + 1),
            "gain_more_5pct": intra["deciles"]["Gain more than 5%"][i],
            "gain_less_5pct": intra["deciles"]["Gain less than 5%"][i],
            "no_change": intra["deciles"]["No change"][i],
            "lose_less_5pct": intra["deciles"]["Lose less than 5%"][i],
            "lose_more_5pct": intra["deciles"]["Lose more than 5%"][i],
        })

    income_bracket_rows = []
    for b in result["by_income_bracket"]:
        income_bracket_rows.append({
            "year": year,
            "bracket": b["bracket"],
            "beneficiaries": b["beneficiaries"],
            "total_cost": b["total_cost"],
            "avg_benefit": b["avg_benefit"],
        })

    suffixed = {
        f"distributional_impact_{variant}.csv": distributional_rows,
        f"metrics_{variant}.csv": metrics_rows,
        f"winners_losers_{variant}.csv": winners_losers_rows,
        f"income_brackets_{variant}.csv": income_bracket_rows,
    }
    for filename, rows in suffixed.items():
        path = os.path.join(output_dir, filename)
        pd.DataFrame(rows).to_csv(path, index=False)
        print(f"Saved: {path}")


@app.local_entrypoint()
def main():
    """Run WV state-level microsim on Modal."""
    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    print(f"Running WV SB 392 tax-cut sim on Modal (year {YEAR})...")
    print(f"Dataset: {WV_DATASET}")
    print(f"Output: {output_dir}")

    result = calculate.remote()
    _save_csvs(result, output_dir)

    print("\nDone.")
