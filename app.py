"""
app.py — Painel de Controlo da Nação (Portugal)

Flask application factory + routes.

Routes:
  GET  /                         → dashboard (index.html)
  GET  /api/demographics         → latest + historical demographic data
  GET  /api/regional             → regional demographic data (NUTs II)
  GET  /api/financial            → latest + historical financial data
  GET  /api/political            → current political data
  GET  /api/import-logs          → last N import log entries
  POST /api/sync                 → trigger data import (all or specific source)
"""

import os

from flask import Flask, jsonify, render_template, request

from models import (
    DataSource,
    DebtPurchase,
    DemographicData,
    FinancialData,
    ImportLog,
    PoliticalData,
    RegionalData,
    db,
)


def create_app(config: dict | None = None) -> Flask:
    """Application factory."""
    app = Flask(__name__)

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config.setdefault(
        "SQLALCHEMY_DATABASE_URI",
        os.environ.get(
            "DATABASE_URL",
            f"sqlite:///{os.path.join(basedir, 'patreotai.db')}",
        ),
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")

    if config:
        app.config.update(config)

    # ------------------------------------------------------------------
    # Extensions
    # ------------------------------------------------------------------
    db.init_app(app)

    with app.app_context():
        db.create_all()
        _bootstrap_data_sources()
        _seed_if_empty()

    # ------------------------------------------------------------------
    # Routes
    # ------------------------------------------------------------------

    @app.route("/")
    def index():
        return render_template("index.html")

    # --- Demographics ---------------------------------------------------

    @app.route("/api/demographics")
    def api_demographics():
        rows = (
            DemographicData.query.order_by(DemographicData.year.asc()).all()
        )
        latest = rows[-1] if rows else None
        return jsonify(
            {
                "latest": latest.to_dict() if latest else {},
                "history": [r.to_dict() for r in rows],
            }
        )

    # --- Regional -------------------------------------------------------

    @app.route("/api/regional")
    def api_regional():
        year = request.args.get("year", type=int)
        query = RegionalData.query.order_by(
            RegionalData.year.desc(), RegionalData.region_name.asc()
        )
        if year:
            query = query.filter_by(year=year)
        rows = query.all()
        # Default: return only the most recent year if no year filter
        if not year and rows:
            latest_year = rows[0].year
            rows = [r for r in rows if r.year == latest_year]
        return jsonify([r.to_dict() for r in rows])

    # --- Financial -------------------------------------------------------

    @app.route("/api/financial")
    def api_financial():
        rows = (
            FinancialData.query.order_by(FinancialData.year.asc()).all()
        )
        latest = rows[-1] if rows else None
        return jsonify(
            {
                "latest": latest.to_dict() if latest else {},
                "history": [r.to_dict() for r in rows],
            }
        )

    # --- Political -------------------------------------------------------

    @app.route("/api/political")
    def api_political():
        row = PoliticalData.query.first()
        return jsonify(row.to_dict() if row else {})

    # --- Import logs -----------------------------------------------------

    @app.route("/api/import-logs")
    def api_import_logs():
        limit = request.args.get("limit", 20, type=int)
        rows = (
            ImportLog.query.order_by(ImportLog.ran_at.desc()).limit(limit).all()
        )
        return jsonify([r.to_dict() for r in rows])

    # --- Sync / trigger import ------------------------------------------

    @app.route("/api/sync", methods=["POST"])
    def api_sync():
        source = request.json.get("source") if request.is_json else None
        from data_importer import run_importers

        results = run_importers(source=source, app=app)
        return jsonify(results)

    # --- Debt purchases --------------------------------------------------

    @app.route("/api/debt-purchases")
    def api_debt_purchases():
        rows = (
            DebtPurchase.query.order_by(
                DebtPurchase.year.asc(), DebtPurchase.instrument.asc()
            ).all()
        )
        return jsonify([r.to_dict() for r in rows])

    # --- Data sources ----------------------------------------------------

    @app.route("/api/sources")
    def api_sources():
        rows = DataSource.query.filter_by(enabled=True).all()
        return jsonify([r.to_dict() for r in rows])

    # --- Map data --------------------------------------------------------

    @app.route("/api/map-data")
    def api_map_data():
        """Regional data enriched with geographic coordinates for the interactive map."""
        # Geographic centres of Portugal's NUTs II regions
        REGION_GEO = {
            "PT11": {"lat": 41.55, "lng": -7.99},
            "PT16": {"lat": 40.20, "lng": -7.88},
            "PT17": {"lat": 38.72, "lng": -9.14},
            "PT18": {"lat": 38.00, "lng": -7.80},
            "PT15": {"lat": 37.10, "lng": -8.10},
            "PT20": {"lat": 37.74, "lng": -25.67},
            "PT30": {"lat": 32.75, "lng": -16.90},
        }
        year = request.args.get("year", type=int)
        query = RegionalData.query.order_by(
            RegionalData.year.desc(), RegionalData.region_name.asc()
        )
        if year:
            query = query.filter_by(year=year)
        rows = query.all()
        if not year and rows:
            latest_year = rows[0].year
            rows = [r for r in rows if r.year == latest_year]
        result = []
        for r in rows:
            d = r.to_dict()
            geo = REGION_GEO.get(r.region_code, {})
            d["lat"] = geo.get("lat")
            d["lng"] = geo.get("lng")
            result.append(d)
        return jsonify(result)

    return app


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _bootstrap_data_sources():
    """Ensure default DataSource rows exist (idempotent)."""
    defaults = [
        {
            "name": "ine_demographics",
            "base_url": "https://www.ine.pt/ine/json_indicador/",
            "description": "INE — Indicadores demográficos",
            "category": "demographic",
        },
        {
            "name": "ine_regional",
            "base_url": "https://www.ine.pt/ine/json_indicador/",
            "description": "INE — Dados regionais (NUTs II)",
            "category": "demographic",
        },
        {
            "name": "bdp_financial",
            "base_url": "https://bpstat.bportugal.pt/data/v1/",
            "description": "Banco de Portugal — Indicadores financeiros",
            "category": "financial",
        },
        {
            "name": "political_static",
            "base_url": "https://www.presidencia.pt",
            "description": "Dados políticos (curados)",
            "category": "political",
        },
        {
            "name": "igcp_debt_purchases",
            "base_url": "https://www.igcp.pt/",
            "description": "IGCP — Compras e emissões de dívida pública",
            "category": "financial",
        },
    ]
    for d in defaults:
        if not DataSource.query.filter_by(name=d["name"]).first():
            db.session.add(DataSource(**d))
    db.session.commit()


def _seed_if_empty():
    """Run importers once if the DB has no data yet."""
    if (
        DemographicData.query.count() == 0
        or FinancialData.query.count() == 0
        or RegionalData.query.count() == 0
    ):
        from data_importer import run_importers

        run_importers()


# ---------------------------------------------------------------------------
# Dev server entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    flask_app = create_app()
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    flask_app.run(debug=debug_mode, host="0.0.0.0", port=5000)
