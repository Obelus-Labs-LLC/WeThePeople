"""
OG (Open Graph) image generation — dynamic preview cards for social sharing.

Generates 1200x630 PNG images with entity stats for Twitter/Reddit/Slack unfurling.
"""

import logging
import threading
import time

from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func

logger = logging.getLogger(__name__)

from models.database import SessionLocal, get_db, TrackedMember, CompanyDonation, CongressionalTrade
from models.finance_models import (
    TrackedInstitution, FinanceLobbyingRecord, FinanceGovernmentContract, FinanceEnforcement,
)
from models.health_models import (
    TrackedCompany as HealthCompany, HealthLobbyingRecord, HealthGovernmentContract, HealthEnforcement,
)
from models.tech_models import (
    TrackedTechCompany, LobbyingRecord as TechLobbyingRecord, GovernmentContract as TechGovernmentContract,
    FTCEnforcement, TechPatent,
)
from models.energy_models import (
    TrackedEnergyCompany, EnergyLobbyingRecord, EnergyGovernmentContract, EnergyEnforcement,
)

router = APIRouter(prefix="/og", tags=["og"])

SECTOR_COLORS = {
    "politics": "#3B82F6",
    "finance": "#10B981",
    "health": "#DC2626",
    "tech": "#8B5CF6",
    "energy": "#F97316",
}


def _fmt_dollar(val: float) -> str:
    if val >= 1_000_000_000:
        return f"${val / 1_000_000_000:.1f}B"
    if val >= 1_000_000:
        return f"${val / 1_000_000:.1f}M"
    if val >= 1_000:
        return f"${val / 1_000:.0f}K"
    return f"${val:,.0f}"


def _fmt_num(val: int) -> str:
    if val >= 1_000_000:
        return f"{val / 1_000_000:.1f}M"
    if val >= 1_000:
        return f"{val / 1_000:.1f}K"
    return f"{val:,}"


def _build_svg(
    name: str,
    sector: str,
    stats: list[tuple[str, str]],
    accent: str,
) -> str:
    """Build an SVG card string (1200x630)."""
    # Escape XML entities
    name_escaped = name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    sector_escaped = sector.upper().replace("&", "&amp;")

    stat_blocks = ""
    x_start = 80
    col_width = 260
    for i, (label, value) in enumerate(stats[:4]):
        x = x_start + (i % 4) * col_width
        y = 380
        label_esc = label.replace("&", "&amp;")
        value_esc = value.replace("&", "&amp;")
        stat_blocks += f'''
        <text x="{x}" y="{y}" fill="rgba(255,255,255,0.5)" font-size="16" font-family="system-ui, sans-serif" font-weight="500">{label_esc}</text>
        <text x="{x}" y="{y + 36}" fill="white" font-size="32" font-family="system-ui, sans-serif" font-weight="700">{value_esc}</text>
        '''

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- Accent bar -->
  <rect x="0" y="0" width="1200" height="6" fill="{accent}"/>
  <!-- Sector badge -->
  <rect x="80" y="60" width="{len(sector_escaped) * 14 + 32}" height="36" rx="18" fill="{accent}" fill-opacity="0.2"/>
  <text x="96" y="84" fill="{accent}" font-size="16" font-family="system-ui, sans-serif" font-weight="700" letter-spacing="2">{sector_escaped}</text>
  <!-- Entity name -->
  <text x="80" y="180" fill="white" font-size="52" font-family="system-ui, sans-serif" font-weight="800">{name_escaped[:40]}</text>
  {f'<text x="80" y="240" fill="white" font-size="52" font-family="system-ui, sans-serif" font-weight="800">{name_escaped[40:80]}</text>' if len(name_escaped) > 40 else ''}
  <!-- Divider -->
  <line x1="80" y1="320" x2="1120" y2="320" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <!-- Stats -->
  {stat_blocks}
  <!-- Branding -->
  <text x="80" y="580" fill="rgba(255,255,255,0.3)" font-size="18" font-family="system-ui, sans-serif" font-weight="600">wethepeopleforus.com</text>
  <text x="1120" y="580" fill="rgba(255,255,255,0.15)" font-size="14" font-family="system-ui, sans-serif" text-anchor="end">Civic Transparency Platform</text>
</svg>'''
    return svg


_cairosvg_available: bool | None = None

def _check_cairosvg() -> bool:
    """Check if cairosvg can actually render (needs libcairo2-dev system lib)."""
    global _cairosvg_available
    if _cairosvg_available is not None:
        return _cairosvg_available
    try:
        import cairosvg
        # Test render to verify system library is present
        cairosvg.svg2png(bytestring=b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', output_width=1, output_height=1)
        _cairosvg_available = True
    except Exception:
        logger.warning("cairosvg unavailable — PNG OG images will fall back to SVG. Install libcairo2-dev and cairosvg.")
        _cairosvg_available = False
    return _cairosvg_available


# Startup check — logs a warning at import time if cairosvg can't render (non-blocking)
_check_cairosvg()


def _svg_to_png(svg_str: str) -> tuple[bytes, str]:
    """Convert SVG string to PNG bytes. Falls back to returning SVG if cairosvg unavailable or crashes.
    Returns (content_bytes, media_type)."""
    try:
        import cairosvg
        png = cairosvg.svg2png(bytestring=svg_str.encode("utf-8"), output_width=1200, output_height=630)
        return png, "image/png"
    except Exception:
        # ImportError (not installed), OSError (libcairo2-dev missing), or any render error
        # Fall back to SVG instead of crashing
        logger.warning("cairosvg render failed — returning SVG fallback for OG image")
        return svg_str.encode("utf-8"), "image/svg+xml"


_og_cache: TTLCache = TTLCache(maxsize=200, ttl=3600)
_og_cache_lock = threading.Lock()


def _generate_og_image(entity_type: str, entity_id: str) -> tuple[bytes, str]:
    """Generate OG image bytes from the database (no caching)."""
    db = SessionLocal()
    try:
        if entity_type == "person":
            member = db.query(TrackedMember).filter(TrackedMember.person_id == entity_id).first()
            if not member:
                raise HTTPException(status_code=404, detail="Person not found")
            trades = db.query(func.count(CongressionalTrade.id)).filter_by(person_id=entity_id).scalar() or 0
            donations = db.query(func.count(CompanyDonation.id)).filter_by(person_id=entity_id).scalar() or 0
            chamber = (member.chamber or "").capitalize()
            party_map = {"D": "Democrat", "R": "Republican", "I": "Independent"}
            party = party_map.get(member.party, member.party or "")
            stats = [
                ("CHAMBER", chamber or "Congress"),
                ("PARTY", party),
                ("STOCK TRADES", _fmt_num(trades)),
                ("DONATIONS", _fmt_num(donations)),
            ]
            return _svg_to_png(_build_svg(member.display_name, "Politics", stats, SECTOR_COLORS["politics"]))

        elif entity_type == "institution":
            inst = db.query(TrackedInstitution).filter_by(institution_id=entity_id).first()
            if not inst:
                raise HTTPException(status_code=404, detail="Institution not found")
            lobby_spend = db.query(func.sum(FinanceLobbyingRecord.income)).filter_by(institution_id=entity_id).scalar() or 0
            contracts = db.query(func.count(FinanceGovernmentContract.id)).filter_by(institution_id=entity_id).scalar() or 0
            enforcement = db.query(func.count(FinanceEnforcement.id)).filter_by(institution_id=entity_id).scalar() or 0
            stats = [
                ("SECTOR", (inst.sector_type or "Finance").upper()),
                ("LOBBYING", _fmt_dollar(float(lobby_spend))),
                ("CONTRACTS", _fmt_num(contracts)),
                ("ENFORCEMENT", _fmt_num(enforcement)),
            ]
            return _svg_to_png(_build_svg(inst.display_name, "Finance", stats, SECTOR_COLORS["finance"]))

        elif entity_type == "health":
            co = db.query(HealthCompany).filter_by(company_id=entity_id).first()
            if not co:
                raise HTTPException(status_code=404, detail="Health company not found")
            lobby_spend = db.query(func.sum(HealthLobbyingRecord.income)).filter_by(company_id=entity_id).scalar() or 0
            contracts = db.query(func.count(HealthGovernmentContract.id)).filter_by(company_id=entity_id).scalar() or 0
            enforcement = db.query(func.count(HealthEnforcement.id)).filter_by(company_id=entity_id).scalar() or 0
            stats = [
                ("SECTOR", (co.sector_type or "Health").upper()),
                ("LOBBYING", _fmt_dollar(float(lobby_spend))),
                ("CONTRACTS", _fmt_num(contracts)),
                ("ENFORCEMENT", _fmt_num(enforcement)),
            ]
            return _svg_to_png(_build_svg(co.display_name, "Health", stats, SECTOR_COLORS["health"]))

        elif entity_type == "tech":
            co = db.query(TrackedTechCompany).filter_by(company_id=entity_id).first()
            if not co:
                raise HTTPException(status_code=404, detail="Tech company not found")
            lobby_spend = db.query(func.sum(TechLobbyingRecord.income)).filter_by(company_id=entity_id).scalar() or 0
            contracts = db.query(func.count(TechGovernmentContract.id)).filter_by(company_id=entity_id).scalar() or 0
            patents = db.query(func.count(TechPatent.id)).filter_by(company_id=entity_id).scalar() or 0
            stats = [
                ("SECTOR", (co.sector_type or "Tech").upper()),
                ("LOBBYING", _fmt_dollar(float(lobby_spend))),
                ("CONTRACTS", _fmt_num(contracts)),
                ("PATENTS", _fmt_num(patents)),
            ]
            return _svg_to_png(_build_svg(co.display_name, "Technology", stats, SECTOR_COLORS["tech"]))

        elif entity_type == "energy":
            co = db.query(TrackedEnergyCompany).filter_by(company_id=entity_id).first()
            if not co:
                raise HTTPException(status_code=404, detail="Energy company not found")
            lobby_spend = db.query(func.sum(EnergyLobbyingRecord.income)).filter_by(company_id=entity_id).scalar() or 0
            contracts = db.query(func.count(EnergyGovernmentContract.id)).filter_by(company_id=entity_id).scalar() or 0
            enforcement = db.query(func.count(EnergyEnforcement.id)).filter_by(company_id=entity_id).scalar() or 0
            stats = [
                ("SECTOR", (co.sector_type or "Energy").upper()),
                ("LOBBYING", _fmt_dollar(float(lobby_spend))),
                ("CONTRACTS", _fmt_num(contracts)),
                ("ENFORCEMENT", _fmt_num(enforcement)),
            ]
            return _svg_to_png(_build_svg(co.display_name, "Energy", stats, SECTOR_COLORS["energy"]))

        else:
            raise HTTPException(status_code=400, detail=f"Unknown entity_type: {entity_type}")
    finally:
        db.close()


def _cached_og_image(entity_type: str, entity_id: str) -> tuple[bytes, str]:
    """Return a cached OG image, regenerating if older than TTL."""
    key = f"{entity_type}:{entity_id}"
    with _og_cache_lock:
        cached = _og_cache.get(key)
    if cached is not None:
        return cached
    result = _generate_og_image(entity_type, entity_id)
    with _og_cache_lock:
        _og_cache[key] = result
    return result


@router.get("/{entity_type}/{entity_id}.png")
def get_og_image(entity_type: str, entity_id: str):
    """Generate an Open Graph preview image for any entity."""
    content, media_type = _cached_og_image(entity_type, entity_id)
    return Response(content=content, media_type=media_type, headers={
        "Cache-Control": "public, max-age=3600",
    })


@router.get("/{entity_type}/{entity_id}.svg")
def get_og_svg(entity_type: str, entity_id: str, db: Session = Depends(get_db)):
    """Generate an Open Graph preview image as SVG (no cairosvg dependency needed)."""
    if entity_type == "person":
        member = db.query(TrackedMember).filter(TrackedMember.person_id == entity_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Person not found")
        trades = db.query(func.count(CongressionalTrade.id)).filter_by(person_id=entity_id).scalar() or 0
        donations = db.query(func.count(CompanyDonation.id)).filter_by(person_id=entity_id).scalar() or 0
        chamber = (member.chamber or "").capitalize()
        party_map = {"D": "Democrat", "R": "Republican", "I": "Independent"}
        party = party_map.get(member.party, member.party or "")
        stats = [("CHAMBER", chamber or "Congress"), ("PARTY", party), ("STOCK TRADES", _fmt_num(trades)), ("DONATIONS", _fmt_num(donations))]
        svg = _build_svg(member.display_name, "Politics", stats, SECTOR_COLORS["politics"])
    else:
        # Reuse the entity lookup logic but return SVG
        # For brevity, generate the same way and just return SVG
        raise HTTPException(status_code=400, detail="SVG endpoint only supports person type for now. Use .png for other entities.")

    return Response(content=svg, media_type="image/svg+xml", headers={
        "Cache-Control": "public, max-age=3600",
    })
