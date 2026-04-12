"""
Expected job intervals (hours) — single source of truth.

Used by routers/ops.py (health check endpoint) and jobs/monitor_pipeline.py.
Unknown jobs default to 24h. A job is "overdue" at 2x its expected interval.
"""

from typing import Dict

EXPECTED_INTERVALS: Dict[str, float] = {
    # Daily (24h)
    "sync_votes": 24, "sync_senate_votes": 24,
    "sync_trades_from_disclosures": 24,
    "detect_anomalies": 24, "detect_stories": 24,
    "story_review_digest": 24, "ai_summarize_daily": 24,
    "sync_samgov": 24, "monitor_pipeline": 24,
    # Every 4 hours
    "twitter_monitor": 4,
    # Every 48 hours
    "sync_finance_political_data": 48, "sync_health_political_data": 48,
    "sync_transportation_data": 48, "sync_defense_data": 48,
    # Every 72 hours
    "sync_finance_enforcement": 72, "sync_energy_enforcement": 72,
    "sync_health_enforcement": 72, "sync_transportation_enforcement": 72,
    "sync_defense_enforcement": 72,
    "sync_chemicals_enforcement": 72, "sync_agriculture_enforcement": 72,
    "sync_education_enforcement": 72, "sync_telecom_enforcement": 72,
    # Weekly (168h)
    "sync_finance_data": 168, "sync_health_data": 168, "sync_tech_data": 168,
    "sync_energy_data": 168, "sync_donations": 168, "sync_nhtsa_data": 168,
    "sync_fuel_economy": 168, "sync_chemicals_data": 168,
    "sync_agriculture_data": 168, "sync_education_data": 168,
    "sync_telecom_data": 168, "sync_regulatory_comments": 168,
    "sync_it_dashboard": 168, "sync_site_scanning": 168,
    "sync_fara_data": 168, "generate_digest": 168, "data_retention": 168,
    # Monthly (720h)
    "sync_state_data": 720,
}
