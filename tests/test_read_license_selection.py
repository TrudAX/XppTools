from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "DEVTools/DEVLicenseUtils/AxTable/DEVLicenseReportObjectLicences.xml"


class ReadLicenseSelectionTest(unittest.TestCase):
    def test_reported_objects_select_team_members(self):
        source = TABLE.read_text(encoding="utf-8")
        read_section = source.split("// STEP 1: Best READ SKU per EntitlementObject", 1)[1].split(
            "// STEP 2:", 1
        )[0]
        self.assertIn("licensingAllSkus.Priority desc", read_section)

        # Model the query's ordering and first-row-per-entitlement selection.
        permissions = [
            ("ACOJOURNALTABLEOVERHEADCOSTS_BR", 1, "Finance"),
            ("ACOJOURNALTABLEOVERHEADCOSTS_BR", 2, "Team members"),
            ("ASSETINTERCOMPANYTRANSFEREDITFINANCIALDIMENSIONASSET", 1, "Finance"),
            ("ASSETINTERCOMPANYTRANSFEREDITFINANCIALDIMENSIONASSET", 2, "Team members"),
            ("BENEFITELIGIBLEJOBTYPE", 1, "Human Resources"),
            ("BENEFITELIGIBLEJOBTYPE", 2, "Team members"),
        ]
        selected = {}
        for object_name, priority, sku in sorted(permissions, key=lambda row: (row[0], -row[1], row[2])):
            selected.setdefault(object_name, sku)

        for object_name in (
            "ACOJOURNALTABLEOVERHEADCOSTS_BR",
            "ASSETINTERCOMPANYTRANSFEREDITFINANCIALDIMENSIONASSET",
            "BENEFITELIGIBLEJOBTYPE",
        ):
            with self.subTest(object_name=object_name):
                self.assertEqual("Team members", selected[object_name])


if __name__ == "__main__":
    unittest.main()
