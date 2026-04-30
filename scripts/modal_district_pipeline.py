"""Modal-based congressional-district pipeline for the WV SB 392 tax-cut
dashboard.

Calculates per-district impacts for West Virginia's two congressional
districts (WV-01..WV-02; state FIPS 54) and writes a single CSV to
``frontend/public/data/``.

Same sign convention as the state pipeline:

    sim_pre_cut = WV with 2025 rates extended into 2026 (revert reform)
    sim_current = WV current law (post-cut)
    impact      = current - pre_cut  (positive => household gains under the cut)

Usage:
    modal run scripts/modal_district_pipeline.py
"""

import json
import os
from pathlib import Path

import modal


app = modal.App("wv-sb392-tax-cut-district-pipeline")

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
    .add_local_file(_REPO_ROOT / "reform_revert.json", "/reforms/reform_revert.json")
)

YEAR = 2026
WV_STATE = "WV"
WV_STATE_FIPS = 54
WV_DISTRICTS = list(range(1, 3))  # WV has 2 congressional districts.
VARIANT = "revert"


def _load_reform() -> dict:
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
    """Build a Reform that supports ``brackets[N]`` index syntax in paths."""
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


def get_wv_districts() -> list[str]:
    return [f"{WV_STATE}-{d:02d}" for d in WV_DISTRICTS]


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=2,
)
def calculate_district(district_id: str) -> dict:
    """Run a single district sim and return its impact row."""
    import numpy as np
    from policyengine_us import Microsimulation

    print(f"Calculating {district_id}...")
    dataset_url = f"hf://policyengine/policyengine-us-data/districts/{district_id}.h5"
    revert = _build_reform_from_overrides(_load_reform())

    try:
        sim_baseline = Microsimulation(dataset=dataset_url, reform=revert)
        sim_reform = Microsimulation(dataset=dataset_url)

        household_weight = np.array(
            sim_baseline.calculate("household_weight", period=YEAR)
        )
        baseline_net = np.array(
            sim_baseline.calculate("household_net_income", period=YEAR)
        )
        reform_net = np.array(
            sim_reform.calculate("household_net_income", period=YEAR)
        )
        income_change = reform_net - baseline_net  # positive => household gain

        total_weight = household_weight.sum()
        if total_weight > 0:
            avg_change = (income_change * household_weight).sum() / total_weight
            avg_baseline = (baseline_net * household_weight).sum() / total_weight
            rel_change = avg_change / avg_baseline if avg_baseline > 0 else 0.0
            winners_share = (
                (household_weight * (income_change > 1)).sum() / total_weight
            )
            losers_share = (
                (household_weight * (income_change < -1)).sum() / total_weight
            )
        else:
            avg_change = rel_change = winners_share = losers_share = 0.0

        try:
            spm_unit_weight = np.array(
                sim_baseline.calculate("spm_unit_weight", period=YEAR)
            )
            total_spm_weight = spm_unit_weight.sum()
            if total_spm_weight > 0:
                pov_bl = np.array(
                    sim_baseline.calculate(
                        "spm_unit_is_in_spm_poverty", period=YEAR
                    )
                )
                pov_rf = np.array(
                    sim_reform.calculate(
                        "spm_unit_is_in_spm_poverty", period=YEAR
                    )
                )
                bl_rate = (pov_bl * spm_unit_weight).sum() / total_spm_weight
                rf_rate = (pov_rf * spm_unit_weight).sum() / total_spm_weight
                poverty_pct_change = (
                    (rf_rate - bl_rate) / bl_rate * 100 if bl_rate > 0 else 0.0
                )
                children = np.array(
                    sim_baseline.calculate(
                        "spm_unit_count_children", period=YEAR
                    )
                )
                child_w = spm_unit_weight * children
                total_child_w = child_w.sum()
                if total_child_w > 0:
                    bl_child = (pov_bl * child_w).sum() / total_child_w
                    rf_child = (pov_rf * child_w).sum() / total_child_w
                    child_poverty_pct_change = (
                        (rf_child - bl_child) / bl_child * 100
                        if bl_child > 0
                        else 0.0
                    )
                else:
                    child_poverty_pct_change = 0.0
            else:
                poverty_pct_change = child_poverty_pct_change = 0.0
        except Exception as poverty_err:
            print(f"  Poverty calc failed for {district_id}: {poverty_err}")
            poverty_pct_change = child_poverty_pct_change = 0.0

        result = {
            "district": district_id,
            "average_household_income_change": round(float(avg_change), 2),
            "relative_household_income_change": round(float(rel_change), 6),
            "winners_share": round(float(winners_share), 4),
            "losers_share": round(float(losers_share), 4),
            "poverty_pct_change": round(float(poverty_pct_change), 2),
            "child_poverty_pct_change": round(float(child_poverty_pct_change), 2),
            "state": WV_STATE,
            "year": YEAR,
            "variant": VARIANT,
        }
        print(
            f"  {district_id}: avg=${avg_change:.2f}  "
            f"winners={winners_share:.1%}  poverty={poverty_pct_change:+.1f}%"
        )
        return result
    except Exception as e:
        print(f"  ERROR {district_id}: {e}")
        return None


@app.local_entrypoint()
def main():
    import pandas as pd

    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    districts = get_wv_districts()
    print(f"Running WV districts {districts} on Modal (year {YEAR})...")

    results = list(calculate_district.map(districts))
    rows = [r for r in results if r is not None]
    failed = len(results) - len(rows)
    if failed:
        print(f"WARNING: {failed} district(s) failed")

    if not rows:
        print("ERROR: no rows produced")
        return

    df = pd.DataFrame(rows).drop(columns=["variant"])
    df = df.sort_values(["state", "district"]).reset_index(drop=True)
    path = os.path.join(output_dir, f"congressional_districts_{VARIANT}.csv")
    df.to_csv(path, index=False)
    print(f"Saved: {path}")
