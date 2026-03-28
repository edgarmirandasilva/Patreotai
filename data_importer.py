"""
data_importer.py — Modular data importer for the Painel de Controlo da Nação.

Usage:
    python data_importer.py                  # run all enabled importers
    python data_importer.py --source ine     # run a specific importer
    python data_importer.py --seed           # load built-in seed data

Architecture:
  Each importer is a class that inherits from BaseImporter and implements
  `fetch()` → list[dict] and `save(records)`.  To add a new data source,
  create a new class, register it in IMPORTERS, and optionally add a
  DataSource row to the database.
"""

import argparse
import logging
from datetime import datetime, timezone

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("data_importer")


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------

class BaseImporter:
    """All importers must inherit from this class."""

    name: str = "base"
    category: str = "generic"

    def __init__(self, app=None):
        self.app = app

    def fetch(self) -> list:
        """Retrieve raw records from the remote source.  Return list of dicts."""
        raise NotImplementedError

    def save(self, records: list) -> int:
        """Persist *records* to the database.  Return number of rows saved."""
        raise NotImplementedError

    def run(self) -> dict:
        """Orchestrate fetch + save and write an ImportLog entry."""
        from models import ImportLog, db

        result = {"source": self.name, "status": "error", "records": 0, "message": ""}
        try:
            records = self.fetch()
            saved = self.save(records)
            result.update(status="success", records=saved, message=f"Imported {saved} records.")
            logger.info("[%s] %s", self.name, result["message"])
        except Exception as exc:
            result["message"] = str(exc)
            logger.error("[%s] import failed: %s", self.name, exc)

        log = ImportLog(
            source_name=self.name,
            status=result["status"],
            records_imported=result["records"],
            message=result["message"],
            ran_at=datetime.now(timezone.utc),
        )
        db.session.add(log)
        db.session.commit()
        return result


# ---------------------------------------------------------------------------
# INE / data.gov.pt importer (demographic)
# ---------------------------------------------------------------------------

class INEDemographicsImporter(BaseImporter):
    """
    Fetches population data from the INE open-data API.
    Endpoint documented at: https://www.ine.pt/ine/api.jsp
    Falls back to curated seed data when the API is unreachable.
    """

    name = "ine_demographics"
    category = "demographic"

    # INE SDMX-JSON endpoint for total resident population (PT)
    API_URL = (
        "https://www.ine.pt/ine/json_indicador/pindica.jsp"
        "?op=2&varcd=0008273&Dim1=S7A2023&lang=PT"
    )

    def fetch(self) -> list:
        try:
            resp = requests.get(self.API_URL, timeout=10)
            resp.raise_for_status()
            payload = resp.json()
            return self._parse_ine_response(payload)
        except Exception as exc:
            logger.warning("INE API unavailable (%s) — using seed data.", exc)
            return self._seed_demographics()

    def _parse_ine_response(self, payload: dict) -> list:
        """Transform INE JSON into a normalised list of dicts."""
        records = []
        try:
            for item in payload.get("DataSet", {}).get("series", []):
                obs = item.get("observations", {})
                for period, values in obs.items():
                    year = int(period[:4])
                    records.append({
                        "year": year,
                        "total_population": int(values[0]) if values else None,
                    })
        except Exception as exc:
            logger.warning("Failed to parse INE response: %s", exc)
        return records if records else self._seed_demographics()

    def _seed_demographics(self) -> list:
        """Curated historical demographic data for Portugal (INE / Pordata)."""
        return [
            {"year": 2019, "total_population": 10_295_909, "population_density": 112.0,
             "life_expectancy": 81.3, "age_0_14_pct": 13.8, "age_15_64_pct": 65.0,
             "age_65_plus_pct": 21.2, "birth_rate": 8.5, "death_rate": 11.4},
            {"year": 2020, "total_population": 10_298_252, "population_density": 112.1,
             "life_expectancy": 80.9, "age_0_14_pct": 13.7, "age_15_64_pct": 64.7,
             "age_65_plus_pct": 21.6, "birth_rate": 8.4, "death_rate": 12.1},
            {"year": 2021, "total_population": 10_343_066, "population_density": 112.6,
             "life_expectancy": 80.4, "age_0_14_pct": 13.8, "age_15_64_pct": 64.2,
             "age_65_plus_pct": 22.0, "birth_rate": 8.4, "death_rate": 12.8},
            {"year": 2022, "total_population": 10_467_366, "population_density": 113.9,
             "life_expectancy": 81.0, "age_0_14_pct": 14.0, "age_15_64_pct": 63.8,
             "age_65_plus_pct": 22.2, "birth_rate": 8.6, "death_rate": 11.9},
            {"year": 2023, "total_population": 10_639_726, "population_density": 115.8,
             "life_expectancy": 81.5, "age_0_14_pct": 14.2, "age_15_64_pct": 63.5,
             "age_65_plus_pct": 22.3, "birth_rate": 8.5, "death_rate": 11.5},
        ]

    def save(self, records: list) -> int:
        from models import DemographicData, db

        saved = 0
        for rec in records:
            year = rec.get("year")
            if not year:
                continue
            existing = DemographicData.query.filter_by(year=year).first()
            if existing:
                obj = existing
            else:
                obj = DemographicData(year=year)
                db.session.add(obj)

            obj.total_population = rec.get("total_population", obj.total_population)
            obj.population_density = rec.get("population_density", obj.population_density)
            obj.life_expectancy = rec.get("life_expectancy", obj.life_expectancy)
            obj.age_0_14_pct = rec.get("age_0_14_pct", obj.age_0_14_pct)
            obj.age_15_64_pct = rec.get("age_15_64_pct", obj.age_15_64_pct)
            obj.age_65_plus_pct = rec.get("age_65_plus_pct", obj.age_65_plus_pct)
            obj.birth_rate = rec.get("birth_rate", obj.birth_rate)
            obj.death_rate = rec.get("death_rate", obj.death_rate)
            obj.source = "INE / data.gov.pt"
            obj.updated_at = datetime.now(timezone.utc)
            saved += 1

        db.session.commit()
        return saved


# ---------------------------------------------------------------------------
# Financial importer (Banco de Portugal / Eurostat seed)
# ---------------------------------------------------------------------------

class BdPFinancialImporter(BaseImporter):
    """
    Fetches financial indicators from Banco de Portugal open data.
    Falls back to curated seed data when the API is unreachable.
    """

    name = "bdp_financial"
    category = "financial"

    # Banco de Portugal SDMX endpoint (example — adapt to live endpoint)
    API_URL = "https://bpstat.bportugal.pt/data/v1/series/?lang=PT&dataset_id=177"

    def fetch(self) -> list:
        try:
            resp = requests.get(self.API_URL, timeout=10)
            resp.raise_for_status()
            return self._seed_financial()   # parse real response here if desired
        except Exception as exc:
            logger.warning("BdP API unavailable (%s) — using seed data.", exc)
            return self._seed_financial()

    def _seed_financial(self) -> list:
        """Curated financial data for Portugal (INE / Eurostat / Banco de Portugal)."""
        return [
            {"year": 2019, "gdp_nominal_eur": 213.9, "gdp_per_capita_eur": 20_791,
             "unemployment_rate": 6.5, "inflation_rate": 0.3, "public_debt_pct_gdp": 116.6,
             "budget_deficit_pct_gdp": 0.1, "exports_eur": 80.0, "imports_eur": 83.2},
            {"year": 2020, "gdp_nominal_eur": 200.9, "gdp_per_capita_eur": 19_504,
             "unemployment_rate": 6.8, "inflation_rate": -0.1, "public_debt_pct_gdp": 135.2,
             "budget_deficit_pct_gdp": 5.8, "exports_eur": 66.3, "imports_eur": 68.9},
            {"year": 2021, "gdp_nominal_eur": 214.1, "gdp_per_capita_eur": 20_708,
             "unemployment_rate": 6.6, "inflation_rate": 0.9, "public_debt_pct_gdp": 127.4,
             "budget_deficit_pct_gdp": 2.9, "exports_eur": 75.3, "imports_eur": 80.8},
            {"year": 2022, "gdp_nominal_eur": 237.7, "gdp_per_capita_eur": 22_712,
             "unemployment_rate": 6.0, "inflation_rate": 7.8, "public_debt_pct_gdp": 113.9,
             "budget_deficit_pct_gdp": 0.4, "exports_eur": 100.1, "imports_eur": 107.5},
            {"year": 2023, "gdp_nominal_eur": 249.5, "gdp_per_capita_eur": 23_451,
             "unemployment_rate": 6.5, "inflation_rate": 4.3, "public_debt_pct_gdp": 108.3,
             "budget_deficit_pct_gdp": 1.2, "exports_eur": 104.8, "imports_eur": 108.9},
        ]

    def save(self, records: list) -> int:
        from models import FinancialData, db

        saved = 0
        for rec in records:
            year = rec.get("year")
            if not year:
                continue
            existing = FinancialData.query.filter_by(year=year).first()
            if existing:
                obj = existing
            else:
                obj = FinancialData(year=year)
                db.session.add(obj)

            obj.gdp_nominal_eur = rec.get("gdp_nominal_eur", obj.gdp_nominal_eur)
            obj.gdp_per_capita_eur = rec.get("gdp_per_capita_eur", obj.gdp_per_capita_eur)
            obj.unemployment_rate = rec.get("unemployment_rate", obj.unemployment_rate)
            obj.inflation_rate = rec.get("inflation_rate", obj.inflation_rate)
            obj.public_debt_pct_gdp = rec.get("public_debt_pct_gdp", obj.public_debt_pct_gdp)
            obj.budget_deficit_pct_gdp = rec.get(
                "budget_deficit_pct_gdp", obj.budget_deficit_pct_gdp
            )
            obj.exports_eur = rec.get("exports_eur", obj.exports_eur)
            obj.imports_eur = rec.get("imports_eur", obj.imports_eur)
            obj.source = "Banco de Portugal / INE / Eurostat"
            obj.updated_at = datetime.now(timezone.utc)
            saved += 1

        db.session.commit()
        return saved


# ---------------------------------------------------------------------------
# Political importer (static / curated)
# ---------------------------------------------------------------------------

class PoliticalImporter(BaseImporter):
    """Stores curated political data for Portugal."""

    name = "political_static"
    category = "political"

    def fetch(self) -> list:
        return [
            {
                "official_name": "República Portuguesa",
                "capital": "Lisboa",
                "government_type": "República semipresidencialista unitária",
                "president": "Marcelo Rebelo de Sousa",
                "prime_minister": "Luís Montenegro",
                "ruling_party": "PSD (Aliança Democrática)",
                "parliament_seats": 230,
                "eu_member_since": 1986,
                "nato_member": True,
            }
        ]

    def save(self, records: list) -> int:
        from models import PoliticalData, db

        saved = 0
        for rec in records:
            existing = PoliticalData.query.filter_by(
                official_name=rec.get("official_name")
            ).first()
            if existing:
                obj = existing
            else:
                obj = PoliticalData()
                db.session.add(obj)

            for key, val in rec.items():
                setattr(obj, key, val)
            obj.source = "Assembleia da República / Presidência da República"
            obj.updated_at = datetime.now(timezone.utc)
            saved += 1

        db.session.commit()
        return saved


# ---------------------------------------------------------------------------
# Registry — add new importers here
# ---------------------------------------------------------------------------

IMPORTERS: dict[str, type] = {
    INEDemographicsImporter.name: INEDemographicsImporter,
    BdPFinancialImporter.name: BdPFinancialImporter,
    PoliticalImporter.name: PoliticalImporter,
}


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def run_importers(source: str | None = None, app=None):
    """Run one or all importers within a Flask app context."""
    targets = (
        {source: IMPORTERS[source]} if source and source in IMPORTERS else IMPORTERS
    )
    results = []
    for name, cls in targets.items():
        importer = cls(app=app)
        results.append(importer.run())
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importador de dados — Painel de Controlo")
    parser.add_argument("--source", help="Nome do importador (ex: ine_demographics)")
    parser.add_argument(
        "--seed", action="store_true", help="Carregar dados de seed (mesmo que sem --source)"
    )
    args = parser.parse_args()

    # Bootstrap Flask app context
    from app import create_app

    flask_app = create_app()
    with flask_app.app_context():
        results = run_importers(source=args.source, app=flask_app)
        for r in results:
            status_icon = "✅" if r["status"] == "success" else "❌"
            print(f"{status_icon}  [{r['source']}]  {r['message']}")
