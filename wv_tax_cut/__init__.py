"""West Virginia SB 392 income tax cut calculation module.

This module provides utilities for calculating household and aggregate impacts
of West Virginia's 2026 SB 392 income tax rate cut using an inverse
reform framework.
"""

from .household import build_household_situation, calculate_household_impact
from .reforms import create_wv_reverted_reform, load_reform, REFORM_PATH
from .microsimulation import calculate_aggregate_impact

__all__ = [
    "build_household_situation",
    "calculate_household_impact",
    "create_wv_reverted_reform",
    "load_reform",
    "REFORM_PATH",
    "calculate_aggregate_impact",
]

__version__ = "1.0.0"
