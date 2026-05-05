"""Reform definitions for the West Virginia SB 392 dashboard.

PolicyEngine-US current law already includes SB 392's 2026 income tax
rate cut. To isolate the cut, this package applies an inverse reform that
restores West Virginia's 2025 income tax rates for 2026 and later.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


# Path to the canonical inverse-reform JSON at the repository root.
REFORM_PATH = Path(__file__).resolve().parent.parent / "reform_revert.json"


def load_reform() -> Dict[str, Any]:
    """Load the WV SB 392 inverse reform dictionary.

    The returned dictionary reverts West Virginia's 2026 income tax rates
    to their pre-SB-392 values. Use :func:`create_wv_reverted_reform` to
    build the PolicyEngine reform class because the JSON paths use
    bracket-index segments that ``Reform.from_dict`` does not support.

    Returns:
        A dictionary of parameter overrides.
    """
    with open(REFORM_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.pop("_comment", None)
    return data


def create_wv_reverted_reform():
    """Build a PolicyEngine Reform that restores pre-SB-392 WV rates."""
    import re

    from policyengine_core.periods import instant
    from policyengine_core.reforms import Reform

    overrides = load_reform()

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
                    start=instant(start_str),
                    stop=instant(stop_str),
                    value=value,
                )
        return parameters

    class WVRevertedRatesReform(Reform):
        def apply(self):
            self.modify_parameters(modify)

    return WVRevertedRatesReform


def get_reform_provisions() -> Dict[str, Dict[str, Any]]:
    """Return a description of the WV SB 392 income tax rate changes."""
    return {
        "sb392_income_tax_rates": {
            "description": (
                "SB 392 reduces each West Virginia personal income tax "
                "marginal rate by roughly 5% beginning in tax year 2026."
            ),
            "parameters": [
                "gov.states.wv.tax.income.rates.single",
                "gov.states.wv.tax.income.rates.joint",
                "gov.states.wv.tax.income.rates.head",
                "gov.states.wv.tax.income.rates.surviving_spouse",
                "gov.states.wv.tax.income.rates.separate",
            ],
            "pre_cut_rates": [0.0222, 0.0296, 0.0333, 0.0444, 0.0482],
            "current_law_rates": [0.0211, 0.0281, 0.0316, 0.0422, 0.0458],
        },
    }
