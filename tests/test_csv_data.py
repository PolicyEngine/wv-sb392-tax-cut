"""Tests for the precomputed WV SB 392 CSV data files."""

import csv
from pathlib import Path

import pytest


DATA_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
VARIANT = "revert"
EXPECTED_YEARS = [2026]
EXPECTED_BRACKETS = {
    "$0 - $25k",
    "$25k - $50k",
    "$50k - $75k",
    "$75k - $100k",
    "$100k - $150k",
    "$150k - $200k",
    "$200k+",
}


class TestDistributionalImpactCSV:
    """Tests for distributional_impact_revert.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / f"distributional_impact_{VARIANT}.csv"
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = ["year", "decile", "average_change", "relative_change"]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_all_deciles(self, data):
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            deciles = {r["decile"] for r in year_data}
            expected = {str(d) for d in range(1, 11)}
            assert deciles == expected, f"Missing deciles for year {year}"

    def test_values_are_numeric(self, data):
        for row in data:
            float(row["year"])
            float(row["average_change"])
            float(row["relative_change"])


class TestMetricsCSV:
    """Tests for metrics_revert.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / f"metrics_{VARIANT}.csv"
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = ["year", "metric", "value"]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_required_metrics(self, data):
        required_metrics = [
            "budgetary_impact",
            "state_tax_revenue_impact",
            "federal_tax_revenue_impact",
            "winners",
            "losers",
            "poverty_baseline_rate",
            "poverty_reform_rate",
        ]
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            metrics = {r["metric"] for r in year_data}
            for metric in required_metrics:
                assert metric in metrics, (
                    f"Missing metric '{metric}' for year {year}"
                )

    def test_state_tax_revenue_impact_is_negative(self, data):
        """SB 392 reduces WV revenue; impact = current law - pre-cut < 0."""
        for year in EXPECTED_YEARS:
            rows = [
                r for r in data
                if int(r["year"]) == year
                and r["metric"] == "state_tax_revenue_impact"
            ]
            assert rows, f"No state_tax_revenue_impact row for {year}"
            value = float(rows[0]["value"])
            assert value < 0, (
                f"Expected negative state_tax_revenue_impact for {year}, "
                f"got {value}"
            )

    def test_avg_benefit_matches_total_cost_per_beneficiary(self, data):
        for year in EXPECTED_YEARS:
            metrics = {
                r["metric"]: float(r["value"])
                for r in data
                if int(r["year"]) == year
            }
            implied = metrics["total_cost"] / metrics["beneficiaries"]
            assert abs(metrics["avg_benefit"] - implied) < 1, (
                "avg_benefit should be approximately total_cost / beneficiaries"
            )


class TestWinnersLosersCSV:
    """Tests for winners_losers.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / f"winners_losers_{VARIANT}.csv"
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = [
            "year", "decile",
            "gain_more_5pct", "gain_less_5pct", "no_change",
            "lose_less_5pct", "lose_more_5pct",
        ]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_all_deciles_and_all(self, data):
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            deciles = {r["decile"] for r in year_data}
            expected = {"All"} | {str(d) for d in range(1, 11)}
            assert deciles == expected, f"Missing deciles for year {year}"

    def test_values_sum_to_one(self, data):
        for row in data:
            total = (
                float(row["gain_more_5pct"])
                + float(row["gain_less_5pct"])
                + float(row["no_change"])
                + float(row["lose_less_5pct"])
                + float(row["lose_more_5pct"])
            )
            assert abs(total - 1.0) < 0.01, f"Row does not sum to 1: {row}"


class TestIncomeBracketsCSV:
    """Tests for income_brackets.csv."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / f"income_brackets_{VARIANT}.csv"
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = ["year", "bracket", "beneficiaries", "total_cost", "avg_benefit"]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_has_all_brackets(self, data):
        for year in EXPECTED_YEARS:
            year_data = [r for r in data if int(r["year"]) == year]
            brackets = {r["bracket"] for r in year_data}
            assert brackets == EXPECTED_BRACKETS, (
                f"Missing brackets for year {year}"
            )


class TestCongressionalDistrictsCSV:
    """Tests for congressional_districts_revert.csv (West Virginia only)."""

    @pytest.fixture
    def data(self):
        filepath = DATA_DIR / f"congressional_districts_{VARIANT}.csv"
        with open(filepath, "r") as f:
            return list(csv.DictReader(f))

    def test_has_required_columns(self, data):
        required = [
            "district",
            "average_household_income_change",
            "relative_household_income_change",
            "state",
            "year",
        ]
        for row in data:
            for col in required:
                assert col in row, f"Missing column: {col}"

    def test_west_virginia_only(self, data):
        """All rows must be West Virginia districts."""
        states = {r["state"] for r in data}
        assert states == {"WV"}, f"Expected only WV rows, got {states}"

    def test_two_districts(self, data):
        """West Virginia has 2 congressional districts."""
        districts = {r["district"] for r in data}
        expected = {"WV-01", "WV-02"}
        assert districts == expected, (
            f"Expected West Virginia districts WV-01..WV-02, got {districts}"
        )
