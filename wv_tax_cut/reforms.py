"""
Reform definitions for the 2026 Utah tax changes dashboard.

The 2026 Utah tax changes (SB60 income tax rate reduction and HB290 CTC
phaseout threshold increases) are already merged into PolicyEngine-US's
baseline parameters (PR #7857). To measure their impact we therefore run
an *inverse* reform that restores the pre-2026 (2025) parameter values.

The reform parameters live in ``reform.json`` at the repository root.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


# Path to the reform.json file at the repository root
REFORM_PATH = Path(__file__).resolve().parent.parent / "reform.json"


def load_reform() -> Dict[str, Any]:
    """Load the Utah 2026 inverse reform dictionary from ``reform.json``.

    The returned dictionary reverts the SB60 Utah income tax rate and the
    HB290 CTC phaseout thresholds to their 2025 values. Pass the result to
    ``Reform.from_dict(load_reform(), country_id="us")`` to build a reform
    whose effect is the opposite sign of current law.

    Returns:
        A reform dictionary suitable for PolicyEngine's ``Reform.from_dict``.
    """
    with open(REFORM_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_reform_provisions() -> Dict[str, Dict[str, Any]]:
    """Return a description of the Utah 2026 tax change provisions.

    Useful for documentation and display in the dashboard. Values describe
    the *current-law* 2026 parameter (the outcome enacted by SB60 and
    HB290); the reverted-to pre-2026 values are encoded in reform.json.
    """
    return {
        "sb60_income_tax_rate": {
            "description": (
                "SB60 reduces the Utah individual income tax rate from "
                "4.5% to 4.45% beginning in tax year 2026."
            ),
            "parameter": "gov.states.ut.tax.income.rate",
            "pre_2026_value": 0.045,
            "current_law_value": 0.0445,
        },
        "hb290_ctc_phaseout_married_separate": {
            "description": (
                "HB290 raises the Utah Child Tax Credit phaseout start "
                "threshold for married filing separately filers."
            ),
            "parameter": (
                "gov.states.ut.tax.income.credits.ctc.reduction.start."
                "SEPARATE"
            ),
            "pre_2026_value": 27_000,
        },
        "hb290_ctc_phaseout_single": {
            "description": (
                "HB290 raises the Utah CTC phaseout start threshold for "
                "single filers."
            ),
            "parameter": (
                "gov.states.ut.tax.income.credits.ctc.reduction.start.SINGLE"
            ),
            "pre_2026_value": 43_000,
        },
        "hb290_ctc_phaseout_head_of_household": {
            "description": (
                "HB290 raises the Utah CTC phaseout start threshold for "
                "head-of-household filers."
            ),
            "parameter": (
                "gov.states.ut.tax.income.credits.ctc.reduction.start."
                "HEAD_OF_HOUSEHOLD"
            ),
            "pre_2026_value": 43_000,
        },
        "hb290_ctc_phaseout_joint": {
            "description": (
                "HB290 raises the Utah CTC phaseout start threshold for "
                "married filing jointly filers."
            ),
            "parameter": (
                "gov.states.ut.tax.income.credits.ctc.reduction.start.JOINT"
            ),
            "pre_2026_value": 54_000,
        },
        "hb290_ctc_phaseout_surviving_spouse": {
            "description": (
                "HB290 raises the Utah CTC phaseout start threshold for "
                "surviving-spouse filers."
            ),
            "parameter": (
                "gov.states.ut.tax.income.credits.ctc.reduction.start."
                "SURVIVING_SPOUSE"
            ),
            "pre_2026_value": 54_000,
        },
    }
