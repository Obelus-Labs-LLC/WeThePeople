"""
FARA (Foreign Agents Registration Act) Bulk Data Connector

Downloads and parses FARA bulk CSV ZIP files from efile.fara.gov.
Provides foreign lobbying registrant, foreign principal, and agent data.

Data source: https://efile.fara.gov/ords/f?p=171:130:0::NO:RP,130:P130_DATERANGE:N
No API key required — public bulk CSV downloads.
"""

import csv
import hashlib
import io
import tempfile
import zipfile
from typing import List, Dict, Any

import requests

from utils.logging import get_logger

logger = get_logger(__name__)

BULK_URLS = {
    "registrants": "https://efile.fara.gov/bulk/zip/FARA_All_Registrants.csv.zip",
    "short_forms": "https://efile.fara.gov/bulk/zip/FARA_All_ShortForms.csv.zip",
    "foreign_principals": "https://efile.fara.gov/bulk/zip/FARA_All_ForeignPrincipals.csv.zip",
}

TIMEOUT = 120  # seconds — bulk ZIPs can be several MB


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _download_and_parse_csv(url: str) -> List[Dict[str, Any]]:
    """Download a ZIP file, extract the CSV inside, parse into list of dicts.

    Handles encoding issues by trying utf-8, then falling back to latin-1.
    """
    logger.info("Downloading FARA bulk file: %s", url)

    resp = requests.get(url, timeout=TIMEOUT, stream=True)
    resp.raise_for_status()

    # Write to temp file so zipfile can seek
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        for chunk in resp.iter_content(chunk_size=65536):
            tmp.write(chunk)
        tmp_path = tmp.name

    rows: List[Dict[str, Any]] = []

    with zipfile.ZipFile(tmp_path, "r") as zf:
        csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if not csv_names:
            logger.error("No CSV file found in ZIP: %s", url)
            return rows

        csv_name = csv_names[0]
        raw_bytes = zf.read(csv_name)

    # Try utf-8 first, fall back to latin-1
    for encoding in ("utf-8", "latin-1"):
        try:
            text = raw_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        logger.error("Could not decode CSV from %s with utf-8 or latin-1", url)
        return rows

    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        # Strip whitespace from keys and values
        cleaned = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k is not None}
        rows.append(cleaned)

    logger.info("Parsed %d rows from %s", len(rows), csv_name)

    # Clean up temp file
    import os
    try:
        os.unlink(tmp_path)
    except OSError:
        pass

    return rows


def fetch_registrants() -> List[Dict[str, Any]]:
    """Fetch all FARA registrants from bulk CSV.

    Returns list of dicts with keys like:
        Registration_Number, Registrant_Name, Address_1, City, State,
        Registration_Date, Termination_Date, Status, etc.
    """
    raw = _download_and_parse_csv(BULK_URLS["registrants"])
    results = []

    for row in raw:
        reg_num = row.get("Registration Number", "")
        name = row.get("Name", row.get("Business Name", ""))
        address = row.get("Address 1", "")
        city = row.get("City", "")
        state = row.get("State", "")
        reg_date = row.get("Registration Date", "")
        term_date = row.get("Termination Date", "")
        # Infer status from termination date
        status = "terminated" if term_date.strip() else "active"

        results.append({
            "registration_number": reg_num,
            "registrant_name": name,
            "address": address,
            "city": city,
            "state": state,
            "country": "",  # Registrants don't have country; principals do
            "registration_date": reg_date,
            "termination_date": term_date,
            "status": status,
            "dedupe_hash": _compute_hash(reg_num, name),
        })

    logger.info("FARA registrants: %d records", len(results))
    return results


def fetch_foreign_principals() -> List[Dict[str, Any]]:
    """Fetch all FARA foreign principals from bulk CSV.

    Returns list of dicts with keys like:
        Registration_Number, Registrant_Name, Foreign_Principal,
        FP_Country, FP_Registration_Date, FP_Termination_Date, etc.
    """
    raw = _download_and_parse_csv(BULK_URLS["foreign_principals"])
    results = []

    for row in raw:
        reg_num = row.get("Registration Number", "")
        reg_name = row.get("Registrant Name", "")
        fp_name = row.get("Foreign Principal", "")
        country = row.get("Country/Location Represented", "")
        reg_date = row.get("Foreign Principal Registration Date", "")
        term_date = row.get("Foreign Principal Termination Date", "")
        status = "terminated" if term_date.strip() else "active"

        results.append({
            "registration_number": reg_num,
            "registrant_name": reg_name,
            "foreign_principal_name": fp_name,
            "country": country,
            "principal_registration_date": reg_date,
            "principal_termination_date": term_date,
            "status": status,
            "dedupe_hash": _compute_hash(reg_num, fp_name, country),
        })

    logger.info("FARA foreign principals: %d records", len(results))
    return results


def fetch_short_forms() -> List[Dict[str, Any]]:
    """Fetch all FARA short forms (individual agents) from bulk CSV.

    Returns list of dicts with keys like:
        Registration_Number, Registrant_Name, Agent_Name,
        Short_Form_Date, etc.
    """
    raw = _download_and_parse_csv(BULK_URLS["short_forms"])
    results = []

    for row in raw:
        reg_num = row.get("Registration Number", "")
        reg_name = row.get("Registrant Name", "")
        first = row.get("Short Form First Name", "")
        last = row.get("Short Form Last Name", "")
        agent_name = f"{first} {last}".strip() if first or last else ""
        address = row.get("Address 1", "")
        city = row.get("City", "")
        state = row.get("State", "")
        sf_date = row.get("Short Form Date", "")
        term_date = row.get("Short Form Termination Date", "")
        status = "terminated" if term_date.strip() else "active"

        results.append({
            "registration_number": reg_num,
            "registrant_name": reg_name,
            "agent_name": agent_name,
            "agent_address": address,
            "agent_city": city,
            "agent_state": state,
            "short_form_date": sf_date,
            "status": status,
            "dedupe_hash": _compute_hash(reg_num, agent_name, sf_date),
        })

    logger.info("FARA short forms: %d records", len(results))
    return results
