"""Tests for the wv_tax_cut.reforms module."""

import json
from pathlib import Path

from wv_tax_cut.reforms import (
    REFORM_PATH,
    create_wv_reverted_reform,
    get_reform_provisions,
    load_reform,
)


class TestReformPath:
    def test_reform_path_points_to_repo_root_file(self):
        assert isinstance(REFORM_PATH, Path)
        assert REFORM_PATH.name == "reform_revert.json"
        assert REFORM_PATH.exists(), f"Expected reform JSON at {REFORM_PATH}"

    def test_reform_json_is_valid_json(self):
        with open(REFORM_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict)


class TestLoadReform:
    def test_load_returns_dict(self):
        reform = load_reform()
        assert isinstance(reform, dict)

    def test_includes_wv_rate_reverts(self):
        reform = load_reform()
        statuses = ["single", "joint", "head", "surviving_spouse", "separate"]
        expected_rates = [0.0222, 0.0296, 0.0333, 0.0444, 0.0482]

        for status in statuses:
            for i, rate in enumerate(expected_rates):
                key = f"gov.states.wv.tax.income.rates.{status}.brackets[{i}].rate"
                assert key in reform, f"Missing WV rate revert: {key}"
                assert any(v == rate for v in reform[key].values())

    def test_reform_structure_for_policyengine(self):
        reform = load_reform()
        for param_path, periods in reform.items():
            assert param_path.startswith("gov.states.wv.")
            assert ".brackets[" in param_path
            assert isinstance(periods, dict)
            for period_str in periods:
                start, end = period_str.split(".")
                assert len(start) == 10
                assert len(end) == 10

    def test_can_build_policyengine_reform(self):
        reform = create_wv_reverted_reform()
        assert reform.__name__ == "WVRevertedRatesReform"


class TestGetReformProvisions:
    def test_returns_wv_sb392_provision(self):
        provisions = get_reform_provisions()
        assert "sb392_income_tax_rates" in provisions
        provision = provisions["sb392_income_tax_rates"]
        assert "West Virginia" in provision["description"]
        assert provision["pre_cut_rates"] == [0.0222, 0.0296, 0.0333, 0.0444, 0.0482]
        assert provision["current_law_rates"] == [0.0211, 0.0281, 0.0316, 0.0422, 0.0458]
