"""
Utah 2026 Tax Changes calculation module.

This module provides utilities for calculating household and aggregate impacts
of the 2026 Utah tax changes — SB60 (income tax rate 4.5% -> 4.45%) and
HB290 (raised CTC phaseout thresholds) — using an inverse reform framework.

Note: PolicyEngine-US already ships the 2026 changes as the current-law
baseline (see PR #7857). The reform.json in this repo reverts those
parameters to their pre-2026 (2025) values. "Impact" is therefore defined
as ``current_law_outcome - reverted_outcome``.
"""

from .household import build_household_situation, calculate_household_impact
from .reforms import load_reform, REFORM_PATH
from .microsimulation import calculate_aggregate_impact

__all__ = [
    "build_household_situation",
    "calculate_household_impact",
    "load_reform",
    "REFORM_PATH",
    "calculate_aggregate_impact",
]

__version__ = "1.0.0"
