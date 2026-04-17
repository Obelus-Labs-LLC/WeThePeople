"""
Chemicals sector data ingestion job.

Fetches data from:
- SEC EDGAR (10-K, 10-Q, 8-K filings)
- USASpending.gov (government contracts)
- Senate LDA (lobbying disclosures)

Usage:
    python jobs/sync_chemicals_data.py [--company COMPANY_ID] [--skip-sec] [--skip-contracts] [--skip-lobbying] [--seed-only]
"""

import os
from connectors.sec_edgar import SEC_BROWSE_BASE
from connectors.senate_lda import LDA_BASE
from connectors.usaspending import USASPENDING_BASE, filter_contracts_by_recipient
import sys
import time
import hashlib
import argparse
import logging
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.chemicals_models import (
    TrackedChemicalCompany,
    SECChemicalFiling,
    ChemicalGovernmentContract,
    ChemicalLobbyingRecord,
)
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_chemicals")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
CONGRESS_API_KEY = os.getenv("CONGRESS_API_KEY", "")
SEC_USER_AGENT = os.getenv("SEC_USER_AGENT", "WeThePeople/1.0 (civic-transparency-project)")

engine = create_engine(DB_PATH, echo=False)

if is_sqlite():
    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

Session = sessionmaker(bind=engine)


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def parse_date(val):
    """Parse YYYY-MM-DD string to date object, or return None."""
    if val is None:
        return None
    from datetime import date as date_type
    if isinstance(val, date_type):
        return val
    s = str(val).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ─── Seed Companies ───────────────────────────────────────────

CHEMICALS_COMPANIES = [
    # Diversified
    {"company_id": "basf", "display_name": "BASF SE", "ticker": "BASFY", "sector_type": "diversified", "headquarters": "Ludwigshafen, Germany", "sec_cik": "0001023177"},
    {"company_id": "dow", "display_name": "Dow Inc.", "ticker": "DOW", "sector_type": "diversified", "headquarters": "Midland, MI", "sec_cik": "0001751788"},
    {"company_id": "dupont", "display_name": "DuPont de Nemours, Inc.", "ticker": "DD", "sector_type": "diversified", "headquarters": "Wilmington, DE", "sec_cik": "0001666700"},
    {"company_id": "3m", "display_name": "3M Company", "ticker": "MMM", "sector_type": "diversified", "headquarters": "Saint Paul, MN", "sec_cik": "0000066740"},
    {"company_id": "eastman", "display_name": "Eastman Chemical Company", "ticker": "EMN", "sector_type": "diversified", "headquarters": "Kingsport, TN", "sec_cik": "0000915389"},
    {"company_id": "huntsman", "display_name": "Huntsman Corporation", "ticker": "HUN", "sector_type": "diversified", "headquarters": "The Woodlands, TX", "sec_cik": "0001307954"},
    {"company_id": "celanese", "display_name": "Celanese Corporation", "ticker": "CE", "sector_type": "diversified", "headquarters": "Irving, TX", "sec_cik": "0001306830"},
    {"company_id": "olin", "display_name": "Olin Corporation", "ticker": "OLN", "sector_type": "diversified", "headquarters": "Clayton, MO", "sec_cik": "0000074303"},
    {"company_id": "westlake", "display_name": "Westlake Corporation", "ticker": "WLK", "sector_type": "diversified", "headquarters": "Houston, TX", "sec_cik": "0001262823"},
    {"company_id": "cabot", "display_name": "Cabot Corporation", "ticker": "CBT", "sector_type": "diversified", "headquarters": "Boston, MA", "sec_cik": "0000018230"},
    # Specialty
    {"company_id": "ecolab", "display_name": "Ecolab Inc.", "ticker": "ECL", "sector_type": "specialty", "headquarters": "Saint Paul, MN", "sec_cik": "0000031462"},
    {"company_id": "sherwin-williams", "display_name": "The Sherwin-Williams Company", "ticker": "SHW", "sector_type": "specialty", "headquarters": "Cleveland, OH", "sec_cik": "0000089800"},
    {"company_id": "ppg", "display_name": "PPG Industries, Inc.", "ticker": "PPG", "sector_type": "specialty", "headquarters": "Pittsburgh, PA", "sec_cik": "0000079879"},
    {"company_id": "rpm-international", "display_name": "RPM International Inc.", "ticker": "RPM", "sector_type": "specialty", "headquarters": "Medina, OH", "sec_cik": "0000110431"},
    {"company_id": "axalta", "display_name": "Axalta Coating Systems Ltd.", "ticker": "AXTA", "sector_type": "specialty", "headquarters": "Philadelphia, PA", "sec_cik": "0001616862"},
    {"company_id": "hb-fuller", "display_name": "H.B. Fuller Company", "ticker": "FUL", "sector_type": "specialty", "headquarters": "Saint Paul, MN", "sec_cik": "0000046619"},
    {"company_id": "quaker-houghton", "display_name": "Quaker Houghton", "ticker": "KWR", "sector_type": "specialty", "headquarters": "Conshohocken, PA", "sec_cik": "0000081362"},
    {"company_id": "ashland", "display_name": "Ashland Inc.", "ticker": "ASH", "sector_type": "specialty", "headquarters": "Wilmington, DE", "sec_cik": "0000886982"},
    {"company_id": "sensient", "display_name": "Sensient Technologies Corporation", "ticker": "SXT", "sector_type": "specialty", "headquarters": "Milwaukee, WI", "sec_cik": "0000023666"},
    # Agrochemical
    {"company_id": "corteva", "display_name": "Corteva Agriscience", "ticker": "CTVA", "sector_type": "agrochemical", "headquarters": "Indianapolis, IN", "sec_cik": "0001755672"},
    {"company_id": "fmc-corp", "display_name": "FMC Corporation", "ticker": "FMC", "sector_type": "agrochemical", "headquarters": "Philadelphia, PA", "sec_cik": "0000037996"},
    {"company_id": "nutrien", "display_name": "Nutrien Ltd.", "ticker": "NTR", "sector_type": "agrochemical", "headquarters": "Saskatoon, Canada", "sec_cik": "0001725964"},
    {"company_id": "mosaic", "display_name": "The Mosaic Company", "ticker": "MOS", "sector_type": "agrochemical", "headquarters": "Tampa, FL", "sec_cik": "0001285785"},
    {"company_id": "cf-industries", "display_name": "CF Industries Holdings, Inc.", "ticker": "CF", "sector_type": "agrochemical", "headquarters": "Deerfield, IL", "sec_cik": "0001324404"},
    {"company_id": "american-vanguard", "display_name": "American Vanguard Corporation", "ticker": "AVV", "sector_type": "agrochemical", "headquarters": "Newport Beach, CA", "sec_cik": "0000005765"},
    # Petrochemical
    {"company_id": "lyondellbasell", "display_name": "LyondellBasell Industries N.V.", "ticker": "LYB", "sector_type": "petrochemical", "headquarters": "Houston, TX", "sec_cik": "0001489393"},
    {"company_id": "chemours", "display_name": "The Chemours Company", "ticker": "CC", "sector_type": "petrochemical", "headquarters": "Wilmington, DE", "sec_cik": "0001627223"},
    {"company_id": "kronos", "display_name": "Kronos Worldwide, Inc.", "ticker": "KRO", "sector_type": "petrochemical", "headquarters": "Dallas, TX", "sec_cik": "0000098222"},
    {"company_id": "tronox", "display_name": "Tronox Holdings plc", "ticker": "TROX", "sector_type": "petrochemical", "headquarters": "Stamford, CT", "sec_cik": "0001530804"},
    {"company_id": "kraton", "display_name": "Kraton Corporation", "ticker": "KRA", "sector_type": "petrochemical", "headquarters": "Houston, TX", "sec_cik": "0001291733"},
    {"company_id": "ferro", "display_name": "Ferro Corporation", "ticker": "FOE", "sector_type": "diversified", "headquarters": "Mayfield Heights, OH", "sec_cik": "0000034066"},
    {"company_id": "koppers", "display_name": "Koppers Holdings Inc.", "ticker": "KOP", "sector_type": "diversified", "headquarters": "Pittsburgh, PA", "sec_cik": "0001374535"},
    {"company_id": "innospec", "display_name": "Innospec Inc.", "ticker": "IOSP", "sector_type": "diversified", "headquarters": "Englewood, CO", "sec_cik": "0000069488"},
    {"company_id": "trinseo", "display_name": "Trinseo PLC", "ticker": "TSE", "sector_type": "diversified", "headquarters": "Wayne, PA", "sec_cik": "0001519061"},
    {"company_id": "avient", "display_name": "Avient Corporation", "ticker": "AVNT", "sector_type": "diversified", "headquarters": "Avon Lake, OH", "sec_cik": "0000046080"},
    {"company_id": "stepan", "display_name": "Stepan Company", "ticker": "SCL", "sector_type": "diversified", "headquarters": "Northfield, IL", "sec_cik": "0000094049"},
    {"company_id": "minerals-technologies", "display_name": "Minerals Technologies Inc.", "ticker": "MTX", "sector_type": "diversified", "headquarters": "New York, NY", "sec_cik": "0000912752"},
    {"company_id": "chemtura", "display_name": "Lanxess AG", "ticker": "LNXSF", "sector_type": "diversified", "headquarters": "Cologne, Germany", "sec_cik": "0001308106"},
    {"company_id": "solvay", "display_name": "Solvay SA", "ticker": "SOLVY", "sector_type": "diversified", "headquarters": "Brussels, Belgium", "sec_cik": ""},
    {"company_id": "arkema", "display_name": "Arkema SA", "ticker": "ARKAY", "sector_type": "diversified", "headquarters": "Colombes, France", "sec_cik": ""},
    # Specialty (additional)
    {"company_id": "international-flavors", "display_name": "International Flavors & Fragrances Inc.", "ticker": "IFF", "sector_type": "specialty", "headquarters": "New York, NY", "sec_cik": "0000051253"},
    {"company_id": "albemarle-specialty", "display_name": "Albemarle Corporation", "ticker": "ALB", "sector_type": "specialty", "headquarters": "Charlotte, NC", "sec_cik": "0000915913"},
    {"company_id": "valvoline", "display_name": "Valvoline Inc.", "ticker": "VVV", "sector_type": "specialty", "headquarters": "Lexington, KY", "sec_cik": "0001674910"},
    {"company_id": "w-r-grace", "display_name": "W. R. Grace & Co.", "ticker": "GRA", "sector_type": "specialty", "headquarters": "Columbia, MD", "sec_cik": "0001045309"},
    {"company_id": "rogers-corp", "display_name": "Rogers Corporation", "ticker": "ROG", "sector_type": "specialty", "headquarters": "Chandler, AZ", "sec_cik": "0000084004"},
    {"company_id": "omnova", "display_name": "Omnova Solutions Inc.", "ticker": "OMN", "sector_type": "specialty", "headquarters": "Beachwood, OH", "sec_cik": "0001062898"},
    {"company_id": "cytec", "display_name": "Cytec Industries Inc.", "ticker": "CYT", "sector_type": "specialty", "headquarters": "Woodland Park, NJ", "sec_cik": "0000811596"},
    {"company_id": "balchem", "display_name": "Balchem Corporation", "ticker": "BCPC", "sector_type": "specialty", "headquarters": "Montvale, NJ", "sec_cik": "0000009984"},
    {"company_id": "elementis", "display_name": "Elementis plc", "ticker": "ELMTY", "sector_type": "specialty", "headquarters": "London, UK", "sec_cik": ""},
    {"company_id": "univar", "display_name": "Univar Solutions Inc.", "ticker": "UNVR", "sector_type": "specialty", "headquarters": "Downers Grove, IL", "sec_cik": "0001494319"},
    {"company_id": "brenntag", "display_name": "Brenntag SE", "ticker": "BNTGY", "sector_type": "specialty", "headquarters": "Essen, Germany", "sec_cik": ""},
    # Agrochemical (additional)
    {"company_id": "scotts-miracle-gro", "display_name": "The Scotts Miracle-Gro Company", "ticker": "SMG", "sector_type": "agrochemical", "headquarters": "Marysville, OH", "sec_cik": "0000825542"},
    {"company_id": "limoneira", "display_name": "Limoneira Company", "ticker": "LMNR", "sector_type": "agrochemical", "headquarters": "Santa Paula, CA", "sec_cik": "0001397911"},
    {"company_id": "intrepid-potash", "display_name": "Intrepid Potash, Inc.", "ticker": "IPI", "sector_type": "agrochemical", "headquarters": "Denver, CO", "sec_cik": "0001421461"},
    {"company_id": "lsb-industries", "display_name": "LSB Industries, Inc.", "ticker": "LXU", "sector_type": "agrochemical", "headquarters": "Oklahoma City, OK", "sec_cik": "0000060714"},
    {"company_id": "rentech-nitrogen", "display_name": "Rentech Nitrogen Partners, LP", "ticker": "RNF", "sector_type": "agrochemical", "headquarters": "Los Angeles, CA", "sec_cik": "0001542971"},
    {"company_id": "upa", "display_name": "UPL Limited", "ticker": "UPL", "sector_type": "agrochemical", "headquarters": "Mumbai, India", "sec_cik": ""},
    {"company_id": "nufarm", "display_name": "Nufarm Limited", "ticker": "NUFMF", "sector_type": "agrochemical", "headquarters": "Melbourne, Australia", "sec_cik": ""},
    # Petrochemical (additional)
    {"company_id": "sasol", "display_name": "Sasol Limited", "ticker": "SSL", "sector_type": "petrochemical", "headquarters": "Johannesburg, South Africa", "sec_cik": "0001274173"},
    {"company_id": "formosa-plastics", "display_name": "Formosa Plastics Corporation", "ticker": "FPCPF", "sector_type": "petrochemical", "headquarters": "Kaohsiung, Taiwan", "sec_cik": ""},
    {"company_id": "nova-chemicals", "display_name": "NOVA Chemicals Corporation", "ticker": "", "sector_type": "petrochemical", "headquarters": "Calgary, Canada", "sec_cik": ""},
    {"company_id": "reliance-industries", "display_name": "Reliance Industries Limited", "ticker": "RELIANCE", "sector_type": "petrochemical", "headquarters": "Mumbai, India", "sec_cik": ""},
    {"company_id": "braskem", "display_name": "Braskem S.A.", "ticker": "BAK", "sector_type": "petrochemical", "headquarters": "Camaçari, Brazil", "sec_cik": "0001369228"},
    {"company_id": "ineos", "display_name": "INEOS Group", "ticker": "", "sector_type": "petrochemical", "headquarters": "London, UK", "sec_cik": ""},
    {"company_id": "covestro", "display_name": "Covestro AG", "ticker": "COVTY", "sector_type": "petrochemical", "headquarters": "Leverkusen, Germany", "sec_cik": ""},
    {"company_id": "wanhua-chemical", "display_name": "Wanhua Chemical Group", "ticker": "", "sector_type": "petrochemical", "headquarters": "Yantai, China", "sec_cik": ""},
    {"company_id": "shin-etsu", "display_name": "Shin-Etsu Chemical Co., Ltd.", "ticker": "SHECY", "sector_type": "petrochemical", "headquarters": "Tokyo, Japan", "sec_cik": ""},
    # Industrial Gas
    {"company_id": "air-products", "display_name": "Air Products and Chemicals, Inc.", "ticker": "APD", "sector_type": "industrial_gas", "headquarters": "Allentown, PA", "sec_cik": "0000002969"},
    {"company_id": "linde", "display_name": "Linde plc", "ticker": "LIN", "sector_type": "industrial_gas", "headquarters": "Woking, UK", "sec_cik": "0001707925"},
    {"company_id": "element-solutions", "display_name": "Element Solutions Inc.", "ticker": "ESI", "sector_type": "industrial_gas", "headquarters": "Fort Lauderdale, FL", "sec_cik": "0001751152"},
    {"company_id": "air-liquide", "display_name": "Air Liquide S.A.", "ticker": "AIQUY", "sector_type": "industrial_gas", "headquarters": "Paris, France", "sec_cik": ""},
    {"company_id": "taiyo-nippon-sanso", "display_name": "Taiyo Nippon Sanso Corporation", "ticker": "TNPSF", "sector_type": "industrial_gas", "headquarters": "Tokyo, Japan", "sec_cik": ""},
    {"company_id": "messer", "display_name": "Messer Industries", "ticker": "", "sector_type": "industrial_gas", "headquarters": "Bad Soden, Germany", "sec_cik": ""},
    {"company_id": "matheson", "display_name": "Matheson Tri-Gas, Inc.", "ticker": "", "sector_type": "industrial_gas", "headquarters": "Basking Ridge, NJ", "sec_cik": ""},
    # Water treatment / environmental chemicals
    {"company_id": "evoqua", "display_name": "Evoqua Water Technologies Corp.", "ticker": "AQUA", "sector_type": "specialty", "headquarters": "Pittsburgh, PA", "sec_cik": "0001713952"},
    {"company_id": "kemira", "display_name": "Kemira Oyj", "ticker": "KMRAF", "sector_type": "specialty", "headquarters": "Helsinki, Finland", "sec_cik": ""},
    {"company_id": "solenis", "display_name": "Solenis LLC", "ticker": "", "sector_type": "specialty", "headquarters": "Wilmington, DE", "sec_cik": ""},
    {"company_id": "nouryon", "display_name": "Nouryon (AkzoNobel Specialty Chemicals)", "ticker": "", "sector_type": "specialty", "headquarters": "Amsterdam, Netherlands", "sec_cik": ""},
    # Construction chemicals
    {"company_id": "sika", "display_name": "Sika AG", "ticker": "SXYAY", "sector_type": "specialty", "headquarters": "Baar, Switzerland", "sec_cik": ""},
    {"company_id": "mapei", "display_name": "MAPEI S.p.A.", "ticker": "", "sector_type": "specialty", "headquarters": "Milan, Italy", "sec_cik": ""},
    # Adhesives / sealants
    {"company_id": "henkel", "display_name": "Henkel AG & Co. KGaA", "ticker": "HENKY", "sector_type": "specialty", "headquarters": "Düsseldorf, Germany", "sec_cik": ""},
    # Coatings
    {"company_id": "akzonobel", "display_name": "Akzo Nobel N.V.", "ticker": "AKZOY", "sector_type": "specialty", "headquarters": "Amsterdam, Netherlands", "sec_cik": ""},
    {"company_id": "nippon-paint", "display_name": "Nippon Paint Holdings Co., Ltd.", "ticker": "NPCPF", "sector_type": "specialty", "headquarters": "Osaka, Japan", "sec_cik": ""},
    {"company_id": "jotun", "display_name": "Jotun A/S", "ticker": "", "sector_type": "specialty", "headquarters": "Sandefjord, Norway", "sec_cik": ""},
    # Catalysts / performance materials
    {"company_id": "johnson-matthey", "display_name": "Johnson Matthey plc", "ticker": "JMPLY", "sector_type": "specialty", "headquarters": "London, UK", "sec_cik": ""},
    {"company_id": "grace-davison", "display_name": "Grace Catalysts Technologies", "ticker": "", "sector_type": "specialty", "headquarters": "Columbia, MD", "sec_cik": ""},
    # Plastic additives / polymer chemicals
    {"company_id": "clariant", "display_name": "Clariant AG", "ticker": "CLZNY", "sector_type": "specialty", "headquarters": "Muttenz, Switzerland", "sec_cik": ""},
    {"company_id": "evonik", "display_name": "Evonik Industries AG", "ticker": "EVKIY", "sector_type": "specialty", "headquarters": "Essen, Germany", "sec_cik": ""},
    {"company_id": "wacker-chemie", "display_name": "Wacker Chemie AG", "ticker": "WKCMF", "sector_type": "specialty", "headquarters": "Munich, Germany", "sec_cik": ""},
    # Electronic chemicals
    {"company_id": "entegris", "display_name": "Entegris, Inc.", "ticker": "ENTG", "sector_type": "specialty", "headquarters": "Billerica, MA", "sec_cik": "0001101302"},
    {"company_id": "cabot-microelectronics", "display_name": "CMC Materials, Inc.", "ticker": "CCMP", "sector_type": "specialty", "headquarters": "Aurora, IL", "sec_cik": "0001102934"},
]


def seed_companies(session):
    """Insert or update tracked chemical companies."""
    count = 0
    for data in CHEMICALS_COMPANIES:
        existing = session.query(TrackedChemicalCompany).filter_by(company_id=data["company_id"]).first()
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            session.add(TrackedChemicalCompany(**data))
            count += 1
    session.commit()
    log.info(f"Seeded {count} new chemical companies ({len(CHEMICALS_COMPANIES)} total)")


# ─── SEC EDGAR ────────────────────────────────────────────────

def fetch_sec_filings(session, company: TrackedChemicalCompany, limit: int = 10000):
    """Fetch recent SEC filings for a chemical company."""
    if not company.sec_cik:
        log.info(f"  [{company.company_id}] No SEC CIK — skipping filings")
        return 0

    cik = company.sec_cik.lstrip("0")
    # Use EDGAR company filings API
    url = f"https://data.sec.gov/submissions/CIK{company.sec_cik}.json"
    headers = {"User-Agent": SEC_USER_AGENT, "Accept": "application/json"}

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"  [{company.company_id}] SEC EDGAR error: {e}")
        return 0

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])
    docs = recent.get("primaryDocument", [])
    descs = recent.get("primaryDocDescription", [])

    count = 0
    target_forms = {"10-K", "10-Q", "8-K", "DEF 14A", "S-1", "20-F", "6-K"}
    for i in range(min(len(forms), limit)):
        if forms[i] not in target_forms:
            continue

        acc = accessions[i]
        dedupe = md5(f"{company.company_id}:{acc}")
        if session.query(SECChemicalFiling).filter_by(accession_number=acc).first():
            continue

        acc_no_dash = acc.replace("-", "")
        filing_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_no_dash}/{docs[i]}" if i < len(docs) and docs[i] else None

        session.add(SECChemicalFiling(
            company_id=company.company_id,
            accession_number=acc,
            form_type=forms[i],
            filing_date=parse_date(dates[i]) if i < len(dates) else None,
            primary_doc_url=filing_url,
            # NOTE: Legacy EDGAR CGI URL still works via redirect to EFTS. Kept for compatibility.
            filing_url=f"{SEC_BROWSE_BASE}?action=getcompany&CIK={cik}&type={forms[i]}&dateb=&owner=include&count=10",
            description=descs[i] if i < len(descs) else None,
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new SEC filings")
    return count


# ─── USASpending.gov Contracts ────────────────────────────────

def fetch_contracts(session, company: TrackedChemicalCompany):
    """Fetch government contracts from USASpending.gov with pagination."""
    search_name = company.usaspending_recipient_name or company.display_name
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    page_size = 100  # API max per page
    page = 1
    count = 0

    while True:
        payload = {
            "filters": {
                "recipient_search_text": [search_name],
                "award_type_codes": ["A", "B", "C", "D"],
                "time_period": [{"start_date": "2015-01-01", "end_date": datetime.now().strftime("%Y-%m-%d")}],
            },
            "fields": ["Award ID", "Award Amount", "Awarding Agency", "Description", "Start Date", "End Date", "Award Type", "Recipient Name"],
            "limit": page_size,
            "page": page,
            "sort": "Award Amount",
            "order": "desc",
        }

        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning(f"  [{company.company_id}] USASpending error (page {page}): {e}")
            break

        results = data.get("results", [])
        if not results:
            break

        # Drop unrelated vendors — USASpending's recipient_search_text is a
        # substring match. See connectors/usaspending.py.
        results = filter_contracts_by_recipient(results, search_name)

        for r in results:
            award_id = r.get("Award ID") or r.get("generated_internal_id", "")
            dedupe = md5(f"{company.company_id}:usa:{award_id}")
            if session.query(ChemicalGovernmentContract).filter_by(dedupe_hash=dedupe).first():
                continue

            session.add(ChemicalGovernmentContract(
                company_id=company.company_id,
                award_id=award_id,
                award_amount=r.get("Award Amount"),
                awarding_agency=r.get("Awarding Agency"),
                description=r.get("Description"),
                start_date=parse_date(r.get("Start Date")),
                end_date=parse_date(r.get("End Date")),
                contract_type=r.get("Award Type"),
                dedupe_hash=dedupe,
            ))
            count += 1

        if len(results) < page_size:
            break
        page += 1
        time.sleep(1)  # polite delay

    session.commit()
    log.info(f"  [{company.company_id}] {count} new contracts")
    return count


# ─── Senate LDA Lobbying ─────────────────────────────────────

def _safe_float(val):
    """Convert value to float, preserving None for nullable fields."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_lobbying(session, company: TrackedChemicalCompany):
    """Fetch lobbying disclosures from Senate LDA with full pagination."""
    search_name = company.display_name
    current_year = datetime.now().year
    years = list(range(current_year, 2019, -1))  # 2020-present
    count = 0

    for year in years:
        page_url = LDA_BASE
        page_num = 0
        headers = {"Accept": "application/json"}

        while page_url:
            params = {
                "client_name": search_name,
                "filing_year": year,
                "page_size": 25,  # API max
            }

            try:
                time.sleep(1)  # polite delay
                if page_num == 0:
                    resp = requests.get(page_url, params=params, headers=headers, timeout=30)
                else:
                    resp = requests.get(page_url, headers=headers, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                log.warning(f"  [{company.company_id}] Senate LDA error ({year}, page {page_num}): {e}")
                break

            results = data.get("results", [])
            for r in results:
                filing_uuid = r.get("filing_uuid", "")
                dedupe = md5(f"{company.company_id}:lda:{filing_uuid}")
                if session.query(ChemicalLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
                    continue

                issues = []
                gov_entities = set()
                descriptions = []
                for activity in (r.get("lobbying_activities") or []):
                    issue_code = activity.get("general_issue_code_display")
                    if issue_code:
                        issues.append(issue_code)
                    desc = activity.get("description") or ""
                    if desc.strip():
                        descriptions.append(desc.strip())
                    for entity in (activity.get("government_entities") or []):
                        name = entity.get("name") if isinstance(entity, dict) else str(entity)
                        if name:
                            gov_entities.add(name)

                session.add(ChemicalLobbyingRecord(
                    company_id=company.company_id,
                    filing_uuid=filing_uuid,
                    filing_year=r.get("filing_year", 0),
                    filing_period=r.get("filing_period_display"),
                    income=_safe_float(r.get("income")),
                    expenses=_safe_float(r.get("expenses")),
                    registrant_name=(r.get("registrant") or {}).get("name"),
                    client_name=(r.get("client") or {}).get("name"),
                    lobbying_issues=", ".join(sorted(set(issues))) if issues else None,
                    government_entities=", ".join(sorted(gov_entities)) if gov_entities else None,
                    specific_issues=" || ".join(descriptions) if descriptions else None,
                    dedupe_hash=dedupe,
                ))
                count += 1

            # Commit after each page to avoid large transactions
            if count > 0:
                session.commit()

            page_url = data.get("next")
            page_num += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new lobbying filings")
    return count


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync chemicals sector data")
    parser.add_argument("--company", type=str, help="Sync only this company_id")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC filings")
    parser.add_argument("--skip-contracts", action="store_true", help="Skip USASpending contracts")
    parser.add_argument("--skip-lobbying", action="store_true", help="Skip lobbying data")
    parser.add_argument("--seed-only", action="store_true", help="Only seed companies, skip data fetch")
    args = parser.parse_args()

    # Create tables
    Base.metadata.create_all(engine)
    session = Session()

    try:
        # Seed companies
        seed_companies(session)

        if args.seed_only:
            log.info("Seed-only mode — done.")
            return

        # Get companies to sync
        query = session.query(TrackedChemicalCompany).filter(TrackedChemicalCompany.is_active == 1)
        if args.company:
            query = query.filter(TrackedChemicalCompany.company_id == args.company)
        companies = query.all()

        log.info(f"Syncing {len(companies)} chemical companies...")

        for co in companies:
            log.info(f"\n{'='*60}")
            cid = co.company_id
            log.info(f"Processing: {co.display_name} ({cid})")
            try:
                if not args.skip_sec:
                    fetch_sec_filings(session, co)
                    time.sleep(0.5)  # SEC rate limit

                if not args.skip_contracts:
                    fetch_contracts(session, co)
                    time.sleep(0.5)

                if not args.skip_lobbying:
                    fetch_lobbying(session, co)
                    time.sleep(0.5)

                # Mark as synced
                co.needs_ingest = 0
                co.last_full_refresh_at = datetime.now(timezone.utc)
                session.commit()
            except Exception as e:
                log.error(f"FAILED {cid}: {e}", exc_info=True)
                session.rollback()

        log.info(f"\nDone! Synced {len(companies)} companies.")

    finally:
        session.close()


if __name__ == "__main__":
    main()
