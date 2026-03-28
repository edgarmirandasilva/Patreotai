"""
models.py — Database models for the Painel de Controlo da Nação.

Tables:
  - DemographicData  : population, density, life expectancy, age distribution
  - FinancialData    : GDP, GDP per capita, unemployment, inflation, public debt
  - PoliticalData    : official name, capital, government type, president, PM
  - DataSource       : registry of import sources (extensible)
  - ImportLog        : audit log for every import run
"""

from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class DemographicData(db.Model):
    __tablename__ = "demographic_data"

    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    total_population = db.Column(db.BigInteger)
    population_density = db.Column(db.Float)          # people / km²
    life_expectancy = db.Column(db.Float)              # years
    age_0_14_pct = db.Column(db.Float)                 # % under 15
    age_15_64_pct = db.Column(db.Float)                # % 15-64
    age_65_plus_pct = db.Column(db.Float)              # % 65+
    birth_rate = db.Column(db.Float)                   # per 1 000
    death_rate = db.Column(db.Float)                   # per 1 000
    source = db.Column(db.String(200))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "total_population": self.total_population,
            "population_density": self.population_density,
            "life_expectancy": self.life_expectancy,
            "age_0_14_pct": self.age_0_14_pct,
            "age_15_64_pct": self.age_15_64_pct,
            "age_65_plus_pct": self.age_65_plus_pct,
            "birth_rate": self.birth_rate,
            "death_rate": self.death_rate,
            "source": self.source,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class FinancialData(db.Model):
    __tablename__ = "financial_data"

    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    gdp_nominal_eur = db.Column(db.Float)              # € billions
    gdp_per_capita_eur = db.Column(db.Float)           # €
    unemployment_rate = db.Column(db.Float)            # %
    inflation_rate = db.Column(db.Float)               # %
    public_debt_pct_gdp = db.Column(db.Float)          # % of GDP
    budget_deficit_pct_gdp = db.Column(db.Float)       # % of GDP
    exports_eur = db.Column(db.Float)                  # € billions
    imports_eur = db.Column(db.Float)                  # € billions
    source = db.Column(db.String(200))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "gdp_nominal_eur": self.gdp_nominal_eur,
            "gdp_per_capita_eur": self.gdp_per_capita_eur,
            "unemployment_rate": self.unemployment_rate,
            "inflation_rate": self.inflation_rate,
            "public_debt_pct_gdp": self.public_debt_pct_gdp,
            "budget_deficit_pct_gdp": self.budget_deficit_pct_gdp,
            "exports_eur": self.exports_eur,
            "imports_eur": self.imports_eur,
            "source": self.source,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PoliticalData(db.Model):
    __tablename__ = "political_data"

    id = db.Column(db.Integer, primary_key=True)
    official_name = db.Column(db.String(200))
    capital = db.Column(db.String(100))
    government_type = db.Column(db.String(200))
    president = db.Column(db.String(200))
    prime_minister = db.Column(db.String(200))
    ruling_party = db.Column(db.String(200))
    parliament_seats = db.Column(db.Integer)
    eu_member_since = db.Column(db.Integer)
    nato_member = db.Column(db.Boolean, default=True)
    source = db.Column(db.String(200))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "official_name": self.official_name,
            "capital": self.capital,
            "government_type": self.government_type,
            "president": self.president,
            "prime_minister": self.prime_minister,
            "ruling_party": self.ruling_party,
            "parliament_seats": self.parliament_seats,
            "eu_member_since": self.eu_member_since,
            "nato_member": self.nato_member,
            "source": self.source,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DataSource(db.Model):
    """Registry of data sources — makes the importer modular and extensible."""

    __tablename__ = "data_source"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    base_url = db.Column(db.String(500))
    description = db.Column(db.Text)
    category = db.Column(db.String(50))   # demographic | financial | political
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "base_url": self.base_url,
            "description": self.description,
            "category": self.category,
            "enabled": self.enabled,
        }


class ImportLog(db.Model):
    """Audit trail for every import run."""

    __tablename__ = "import_log"

    id = db.Column(db.Integer, primary_key=True)
    source_name = db.Column(db.String(100))
    status = db.Column(db.String(20))      # success | error | partial
    records_imported = db.Column(db.Integer, default=0)
    message = db.Column(db.Text)
    ran_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "source_name": self.source_name,
            "status": self.status,
            "records_imported": self.records_imported,
            "message": self.message,
            "ran_at": self.ran_at.isoformat() if self.ran_at else None,
        }
