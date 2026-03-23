"""
Seed Tracked Companies — Maximum Coverage

Populates tracked company/institution tables across all 4 industry sectors
with comprehensive lists of top US companies by market cap/revenue/assets.

Does NOT duplicate existing entries (checks by company_id/institution_id).
Prints summary of what was added vs skipped.

Usage:
    python jobs/seed_tracked_companies.py
    python jobs/seed_tracked_companies.py --sector finance
    python jobs/seed_tracked_companies.py --sector health
    python jobs/seed_tracked_companies.py --sector tech
    python jobs/seed_tracked_companies.py --sector energy
    python jobs/seed_tracked_companies.py --dry-run
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import Base, engine, SessionLocal
from models.finance_models import TrackedInstitution
from models.health_models import TrackedCompany
from models.tech_models import TrackedTechCompany
from models.energy_models import TrackedEnergyCompany
from models.transportation_models import TrackedTransportationCompany
from models.defense_models import TrackedDefenseCompany


# ============================================================================
# FINANCE — 150+ institutions
# ============================================================================

FINANCE_INSTITUTIONS = [
    # ── Top 50 US Banks (by assets) ──
    {"institution_id": "jpmorgan", "display_name": "JPMorgan Chase & Co.", "ticker": "JPM", "sector_type": "bank", "sec_cik": "0000019617", "fdic_cert": "628", "cfpb_company_name": "JPMORGAN CHASE & CO."},
    {"institution_id": "bank-of-america", "display_name": "Bank of America Corporation", "ticker": "BAC", "sector_type": "bank", "sec_cik": "0000070858", "fdic_cert": "3510", "cfpb_company_name": "BANK OF AMERICA, NATIONAL ASSOCIATION"},
    {"institution_id": "citigroup", "display_name": "Citigroup Inc.", "ticker": "C", "sector_type": "bank", "sec_cik": "0000831001", "fdic_cert": "7213", "cfpb_company_name": "CITIBANK, N.A."},
    {"institution_id": "wells-fargo", "display_name": "Wells Fargo & Company", "ticker": "WFC", "sector_type": "bank", "sec_cik": "0000072971", "fdic_cert": "3511", "cfpb_company_name": "WELLS FARGO & COMPANY"},
    {"institution_id": "goldman-sachs", "display_name": "Goldman Sachs Group Inc.", "ticker": "GS", "sector_type": "bank", "sec_cik": "0000886982", "fdic_cert": "33124", "cfpb_company_name": "GOLDMAN SACHS BANK USA"},
    {"institution_id": "morgan-stanley", "display_name": "Morgan Stanley", "ticker": "MS", "sector_type": "bank", "sec_cik": "0000895421", "fdic_cert": "32992", "cfpb_company_name": "MORGAN STANLEY"},
    {"institution_id": "us-bancorp", "display_name": "U.S. Bancorp", "ticker": "USB", "sector_type": "bank", "sec_cik": "0000036104", "fdic_cert": "6548", "cfpb_company_name": "U.S. BANCORP"},
    {"institution_id": "truist", "display_name": "Truist Financial Corporation", "ticker": "TFC", "sector_type": "bank", "sec_cik": "0000092230", "fdic_cert": "9846", "cfpb_company_name": "TRUIST BANK"},
    {"institution_id": "pnc-financial", "display_name": "PNC Financial Services Group", "ticker": "PNC", "sector_type": "bank", "sec_cik": "0000713676", "fdic_cert": "6384", "cfpb_company_name": "PNC BANK, N.A."},
    {"institution_id": "capital-one", "display_name": "Capital One Financial Corporation", "ticker": "COF", "sector_type": "bank", "sec_cik": "0000927628", "fdic_cert": "33954", "cfpb_company_name": "CAPITAL ONE FINANCIAL CORPORATION"},
    {"institution_id": "td-bank", "display_name": "TD Bank US Holding Company", "ticker": "TD", "sector_type": "bank", "sec_cik": None, "fdic_cert": "17529", "cfpb_company_name": "TD BANK US HOLDING COMPANY"},
    {"institution_id": "bny-mellon", "display_name": "Bank of New York Mellon Corporation", "ticker": "BK", "sector_type": "bank", "sec_cik": "0001390777", "fdic_cert": "542", "cfpb_company_name": "THE BANK OF NEW YORK MELLON"},
    {"institution_id": "state-street", "display_name": "State Street Corporation", "ticker": "STT", "sector_type": "bank", "sec_cik": "0000093751", "fdic_cert": "14", "cfpb_company_name": "STATE STREET BANK AND TRUST COMPANY"},
    {"institution_id": "charles-schwab", "display_name": "Charles Schwab Corporation", "ticker": "SCHW", "sector_type": "bank", "sec_cik": "0000316709", "fdic_cert": "57450", "cfpb_company_name": "CHARLES SCHWAB BANK"},
    {"institution_id": "hsbc-us", "display_name": "HSBC Holdings plc (US)", "ticker": "HSBC", "sector_type": "bank", "sec_cik": "0000083246", "fdic_cert": "413", "cfpb_company_name": "HSBC BANK USA, N.A."},
    {"institution_id": "citizens-financial", "display_name": "Citizens Financial Group Inc.", "ticker": "CFG", "sector_type": "bank", "sec_cik": "0001694514", "fdic_cert": "21029", "cfpb_company_name": "CITIZENS BANK, N.A."},
    {"institution_id": "fifth-third", "display_name": "Fifth Third Bancorp", "ticker": "FITB", "sector_type": "bank", "sec_cik": "0000035527", "fdic_cert": "6672", "cfpb_company_name": "FIFTH THIRD BANK"},
    {"institution_id": "mandt", "display_name": "M&T Bank Corporation", "ticker": "MTB", "sector_type": "bank", "sec_cik": "0000036270", "fdic_cert": "501", "cfpb_company_name": "M&T BANK"},
    {"institution_id": "keycorp", "display_name": "KeyCorp", "ticker": "KEY", "sector_type": "bank", "sec_cik": "0000091576", "fdic_cert": "17394", "cfpb_company_name": "KEYBANK NATIONAL ASSOCIATION"},
    {"institution_id": "regions-financial", "display_name": "Regions Financial Corporation", "ticker": "RF", "sector_type": "bank", "sec_cik": "0001281761", "fdic_cert": "233", "cfpb_company_name": "REGIONS BANK"},
    {"institution_id": "huntington-bancshares", "display_name": "Huntington Bancshares Inc.", "ticker": "HBAN", "sector_type": "bank", "sec_cik": "0000049196", "fdic_cert": "7745", "cfpb_company_name": "THE HUNTINGTON NATIONAL BANK"},
    {"institution_id": "northern-trust", "display_name": "Northern Trust Corporation", "ticker": "NTRS", "sector_type": "bank", "sec_cik": "0000073124", "fdic_cert": "10635", "cfpb_company_name": "THE NORTHERN TRUST COMPANY"},
    {"institution_id": "ally-financial", "display_name": "Ally Financial Inc.", "ticker": "ALLY", "sector_type": "bank", "sec_cik": "0000040729", "fdic_cert": "57803", "cfpb_company_name": "ALLY FINANCIAL INC."},
    {"institution_id": "comerica", "display_name": "Comerica Incorporated", "ticker": "CMA", "sector_type": "bank", "sec_cik": "0000028412", "fdic_cert": "25576", "cfpb_company_name": "COMERICA BANK"},
    {"institution_id": "zions-bancorp", "display_name": "Zions Bancorporation", "ticker": "ZION", "sector_type": "bank", "sec_cik": "0000109380", "fdic_cert": "2270", "cfpb_company_name": "ZIONS BANCORPORATION, N.A."},
    {"institution_id": "synchrony", "display_name": "Synchrony Financial", "ticker": "SYF", "sector_type": "bank", "sec_cik": "0001601712", "fdic_cert": "27314", "cfpb_company_name": "SYNCHRONY FINANCIAL"},
    {"institution_id": "discover", "display_name": "Discover Financial Services", "ticker": "DFS", "sector_type": "bank", "sec_cik": "0001393612", "fdic_cert": "30810", "cfpb_company_name": "DISCOVER BANK"},
    {"institution_id": "first-republic", "display_name": "First Citizens BancShares", "ticker": "FCNCA", "sector_type": "bank", "sec_cik": "0000798941", "fdic_cert": "11063"},
    {"institution_id": "western-alliance", "display_name": "Western Alliance Bancorporation", "ticker": "WAL", "sector_type": "bank", "sec_cik": "0001124804"},
    {"institution_id": "east-west-bancorp", "display_name": "East West Bancorp Inc.", "ticker": "EWBC", "sector_type": "bank", "sec_cik": "0000806279"},
    {"institution_id": "webster-financial", "display_name": "Webster Financial Corporation", "ticker": "WBS", "sector_type": "bank", "sec_cik": "0000801337"},
    {"institution_id": "cullen-frost", "display_name": "Cullen/Frost Bankers Inc.", "ticker": "CFR", "sector_type": "bank", "sec_cik": "0000039263"},
    {"institution_id": "popular-inc", "display_name": "Popular Inc.", "ticker": "BPOP", "sector_type": "bank", "sec_cik": "0000763901"},
    {"institution_id": "new-york-community", "display_name": "New York Community Bancorp", "ticker": "NYCB", "sector_type": "bank", "sec_cik": "0000910073"},
    {"institution_id": "valley-national", "display_name": "Valley National Bancorp", "ticker": "VLY", "sector_type": "bank", "sec_cik": "0000074260"},
    {"institution_id": "wintrust", "display_name": "Wintrust Financial Corporation", "ticker": "WTFC", "sector_type": "bank", "sec_cik": "0001015328"},
    {"institution_id": "glacier-bancorp", "display_name": "Glacier Bancorp Inc.", "ticker": "GBCI", "sector_type": "bank", "sec_cik": "0000042682"},
    {"institution_id": "svb-financial", "display_name": "SVB Financial Group", "ticker": None, "sector_type": "bank", "sec_cik": "0000719739"},
    {"institution_id": "first-horizon", "display_name": "First Horizon Corporation", "ticker": "FHN", "sector_type": "bank", "sec_cik": "0000036966"},
    {"institution_id": "synovus", "display_name": "Synovus Financial Corp.", "ticker": "SNV", "sector_type": "bank", "sec_cik": "0000018349"},
    {"institution_id": "columbia-banking", "display_name": "Columbia Banking System Inc.", "ticker": "COLB", "sector_type": "bank", "sec_cik": "0001166928"},
    {"institution_id": "hancock-whitney", "display_name": "Hancock Whitney Corporation", "ticker": "HWC", "sector_type": "bank", "sec_cik": "0000750577"},
    {"institution_id": "bok-financial", "display_name": "BOK Financial Corporation", "ticker": "BOKF", "sector_type": "bank", "sec_cik": "0000875357"},
    {"institution_id": "pacific-premier", "display_name": "Pacific Premier Bancorp", "ticker": "PPBI", "sector_type": "bank", "sec_cik": "0000792966"},
    {"institution_id": "independent-bank", "display_name": "Independent Bank Group Inc.", "ticker": "IBTX", "sector_type": "bank", "sec_cik": "0001564618"},
    {"institution_id": "home-bancfin", "display_name": "Home BancFins Inc.", "ticker": "HBCP", "sector_type": "bank", "sec_cik": None},

    # ── Federal Reserve ──
    {"institution_id": "federal-reserve", "display_name": "Federal Reserve System", "ticker": None, "sector_type": "central_bank", "sec_cik": None},

    # ── Major Insurance Companies ──
    {"institution_id": "berkshire-hathaway", "display_name": "Berkshire Hathaway Inc.", "ticker": "BRK.B", "sector_type": "insurance", "sec_cik": "0001067983"},
    {"institution_id": "metlife", "display_name": "MetLife Inc.", "ticker": "MET", "sector_type": "insurance", "sec_cik": "0001099219"},
    {"institution_id": "prudential", "display_name": "Prudential Financial Inc.", "ticker": "PRU", "sector_type": "insurance", "sec_cik": "0001137774"},
    {"institution_id": "aig", "display_name": "American International Group Inc.", "ticker": "AIG", "sector_type": "insurance", "sec_cik": "0000005272"},
    {"institution_id": "aflac", "display_name": "Aflac Incorporated", "ticker": "AFL", "sector_type": "insurance", "sec_cik": "0000004977"},
    {"institution_id": "chubb", "display_name": "Chubb Limited", "ticker": "CB", "sector_type": "insurance", "sec_cik": "0000896159"},
    {"institution_id": "allstate", "display_name": "The Allstate Corporation", "ticker": "ALL", "sector_type": "insurance", "sec_cik": "0000899629"},
    {"institution_id": "travelers", "display_name": "The Travelers Companies Inc.", "ticker": "TRV", "sector_type": "insurance", "sec_cik": "0000086312"},
    {"institution_id": "progressive", "display_name": "Progressive Corporation", "ticker": "PGR", "sector_type": "insurance", "sec_cik": "0000080661"},
    {"institution_id": "hartford", "display_name": "The Hartford Financial Services", "ticker": "HIG", "sector_type": "insurance", "sec_cik": "0000874766"},
    {"institution_id": "principal", "display_name": "Principal Financial Group Inc.", "ticker": "PFG", "sector_type": "insurance", "sec_cik": "0001126328"},
    {"institution_id": "lincoln-national", "display_name": "Lincoln National Corporation", "ticker": "LNC", "sector_type": "insurance", "sec_cik": "0000059558"},
    {"institution_id": "unum", "display_name": "Unum Group", "ticker": "UNM", "sector_type": "insurance", "sec_cik": "0000005513"},
    {"institution_id": "loews", "display_name": "Loews Corporation (CNA)", "ticker": "L", "sector_type": "insurance", "sec_cik": "0000060714"},
    {"institution_id": "markel", "display_name": "Markel Group Inc.", "ticker": "MKL", "sector_type": "insurance", "sec_cik": "0000700923"},
    {"institution_id": "everest-group", "display_name": "Everest Group Ltd.", "ticker": "EG", "sector_type": "insurance", "sec_cik": "0000885136"},
    {"institution_id": "renaissancere", "display_name": "RenaissanceRe Holdings Ltd.", "ticker": "RNR", "sector_type": "insurance", "sec_cik": "0000913144"},
    {"institution_id": "arch-capital", "display_name": "Arch Capital Group Ltd.", "ticker": "ACGL", "sector_type": "insurance", "sec_cik": "0000947484"},
    {"institution_id": "w-r-berkley", "display_name": "W. R. Berkley Corporation", "ticker": "WRB", "sector_type": "insurance", "sec_cik": "0000011544"},
    {"institution_id": "erie-indemnity", "display_name": "Erie Indemnity Company", "ticker": "ERIE", "sector_type": "insurance", "sec_cik": "0000049697"},
    {"institution_id": "globe-life", "display_name": "Globe Life Inc.", "ticker": "GL", "sector_type": "insurance", "sec_cik": "0000320017"},
    {"institution_id": "fidelity-national", "display_name": "Fidelity National Financial", "ticker": "FNF", "sector_type": "insurance", "sec_cik": "0001331875"},

    # ── Asset Managers ──
    {"institution_id": "blackrock", "display_name": "BlackRock Inc.", "ticker": "BLK", "sector_type": "investment", "sec_cik": "0001364742"},
    {"institution_id": "vanguard", "display_name": "The Vanguard Group", "ticker": None, "sector_type": "investment", "sec_cik": None},
    {"institution_id": "fidelity", "display_name": "Fidelity Investments (FMR LLC)", "ticker": None, "sector_type": "investment", "sec_cik": "0000315066"},
    {"institution_id": "invesco", "display_name": "Invesco Ltd.", "ticker": "IVZ", "sector_type": "investment", "sec_cik": "0000914208"},
    {"institution_id": "t-rowe-price", "display_name": "T. Rowe Price Group Inc.", "ticker": "TROW", "sector_type": "investment", "sec_cik": "0001116132"},
    {"institution_id": "franklin-templeton", "display_name": "Franklin Resources Inc.", "ticker": "BEN", "sector_type": "investment", "sec_cik": "0000038777"},
    {"institution_id": "kkr", "display_name": "KKR & Co. Inc.", "ticker": "KKR", "sector_type": "investment", "sec_cik": "0001404912"},
    {"institution_id": "apollo", "display_name": "Apollo Global Management Inc.", "ticker": "APO", "sector_type": "investment", "sec_cik": "0001411494"},
    {"institution_id": "blackstone", "display_name": "Blackstone Inc.", "ticker": "BX", "sector_type": "investment", "sec_cik": "0001393818"},
    {"institution_id": "carlyle", "display_name": "The Carlyle Group Inc.", "ticker": "CG", "sector_type": "investment", "sec_cik": "0001527166"},
    {"institution_id": "ares-management", "display_name": "Ares Management Corporation", "ticker": "ARES", "sector_type": "investment", "sec_cik": "0001555280"},
    {"institution_id": "brookfield-asset", "display_name": "Brookfield Asset Management", "ticker": "BAM", "sector_type": "investment", "sec_cik": "0001001085"},
    {"institution_id": "blue-owl", "display_name": "Blue Owl Capital Inc.", "ticker": "OWL", "sector_type": "investment", "sec_cik": "0001823945"},
    {"institution_id": "tpg-inc", "display_name": "TPG Inc.", "ticker": "TPG", "sector_type": "investment", "sec_cik": "0001880661"},
    {"institution_id": "raymond-james", "display_name": "Raymond James Financial Inc.", "ticker": "RJF", "sector_type": "investment", "sec_cik": "0000720005"},
    {"institution_id": "lazard", "display_name": "Lazard Inc.", "ticker": "LAZ", "sector_type": "investment", "sec_cik": "0001311370"},
    {"institution_id": "ameriprise", "display_name": "Ameriprise Financial Inc.", "ticker": "AMP", "sector_type": "investment", "sec_cik": "0000820081"},
    {"institution_id": "lpl-financial", "display_name": "LPL Financial Holdings Inc.", "ticker": "LPLA", "sector_type": "investment", "sec_cik": "0001397187"},
    {"institution_id": "stifel-financial", "display_name": "Stifel Financial Corp.", "ticker": "SF", "sector_type": "investment", "sec_cik": "0000885530"},

    # ── Fintech ──
    {"institution_id": "paypal", "display_name": "PayPal Holdings Inc.", "ticker": "PYPL", "sector_type": "fintech", "sec_cik": "0001633917"},
    {"institution_id": "block-inc", "display_name": "Block Inc. (Square)", "ticker": "SQ", "sector_type": "fintech", "sec_cik": "0001512673"},
    {"institution_id": "sofi", "display_name": "SoFi Technologies Inc.", "ticker": "SOFI", "sector_type": "fintech", "sec_cik": "0001818874"},
    {"institution_id": "robinhood", "display_name": "Robinhood Markets Inc.", "ticker": "HOOD", "sector_type": "fintech", "sec_cik": "0001783879"},
    {"institution_id": "coinbase", "display_name": "Coinbase Global Inc.", "ticker": "COIN", "sector_type": "fintech", "sec_cik": "0001679788"},
    {"institution_id": "affirm", "display_name": "Affirm Holdings Inc.", "ticker": "AFRM", "sector_type": "fintech", "sec_cik": "0001820953"},
    {"institution_id": "marqeta", "display_name": "Marqeta Inc.", "ticker": "MQ", "sector_type": "fintech", "sec_cik": "0001522540"},
    {"institution_id": "toast", "display_name": "Toast Inc.", "ticker": "TOST", "sector_type": "fintech", "sec_cik": "0001650164"},
    {"institution_id": "upstart", "display_name": "Upstart Holdings Inc.", "ticker": "UPST", "sector_type": "fintech", "sec_cik": "0001647639"},
    {"institution_id": "green-dot", "display_name": "Green Dot Corporation", "ticker": "GDOT", "sector_type": "fintech", "sec_cik": "0001386278"},
    {"institution_id": "lemonade", "display_name": "Lemonade Inc.", "ticker": "LMND", "sector_type": "fintech", "sec_cik": "0001691421"},
    {"institution_id": "bill-holdings", "display_name": "BILL Holdings Inc.", "ticker": "BILL", "sector_type": "fintech", "sec_cik": "0001786352"},
    {"institution_id": "shift4", "display_name": "Shift4 Payments Inc.", "ticker": "FOUR", "sector_type": "fintech", "sec_cik": "0001794669"},
    {"institution_id": "nuvei", "display_name": "Nuvei Corporation", "ticker": "NVEI", "sector_type": "fintech", "sec_cik": None},

    # ── Payments / Credit Cards / Exchanges ──
    {"institution_id": "visa", "display_name": "Visa Inc.", "ticker": "V", "sector_type": "payments", "sec_cik": "0001403161"},
    {"institution_id": "mastercard", "display_name": "Mastercard Incorporated", "ticker": "MA", "sector_type": "payments", "sec_cik": "0001141391"},
    {"institution_id": "american-express", "display_name": "American Express Company", "ticker": "AXP", "sector_type": "payments", "sec_cik": "0000004962", "cfpb_company_name": "AMERICAN EXPRESS COMPANY"},
    {"institution_id": "fiserv", "display_name": "Fiserv Inc.", "ticker": "FI", "sector_type": "payments", "sec_cik": "0000798354"},
    {"institution_id": "fis", "display_name": "Fidelity National Information Services", "ticker": "FIS", "sector_type": "payments", "sec_cik": "0001136893"},
    {"institution_id": "global-payments", "display_name": "Global Payments Inc.", "ticker": "GPN", "sector_type": "payments", "sec_cik": "0001123360"},
    {"institution_id": "jack-henry", "display_name": "Jack Henry & Associates Inc.", "ticker": "JKHY", "sector_type": "payments", "sec_cik": "0000896429"},
    {"institution_id": "fleetcor", "display_name": "FLEETCOR Technologies Inc.", "ticker": "FLT", "sector_type": "payments", "sec_cik": "0001175454"},
    {"institution_id": "intercontinental-exchange", "display_name": "Intercontinental Exchange Inc.", "ticker": "ICE", "sector_type": "exchange", "sec_cik": "0001571949"},
    {"institution_id": "cme-group", "display_name": "CME Group Inc.", "ticker": "CME", "sector_type": "exchange", "sec_cik": "0001156375"},
    {"institution_id": "nasdaq-inc", "display_name": "Nasdaq Inc.", "ticker": "NDAQ", "sector_type": "exchange", "sec_cik": "0000813672"},
    {"institution_id": "cboe", "display_name": "Cboe Global Markets Inc.", "ticker": "CBOE", "sector_type": "exchange", "sec_cik": "0001374310"},
    {"institution_id": "msci", "display_name": "MSCI Inc.", "ticker": "MSCI", "sector_type": "exchange", "sec_cik": "0001408198"},
    {"institution_id": "sp-global", "display_name": "S&P Global Inc.", "ticker": "SPGI", "sector_type": "exchange", "sec_cik": "0000064040"},
    {"institution_id": "moodys", "display_name": "Moody's Corporation", "ticker": "MCO", "sector_type": "exchange", "sec_cik": "0001059556"},

    # ── Credit Unions & Mortgage ──
    {"institution_id": "rocket-companies", "display_name": "Rocket Companies Inc.", "ticker": "RKT", "sector_type": "mortgage", "sec_cik": "0001805284"},
    {"institution_id": "mr-cooper", "display_name": "Mr. Cooper Group Inc.", "ticker": "COOP", "sector_type": "mortgage", "sec_cik": "0001286613"},
    {"institution_id": "uwm-holdings", "display_name": "UWM Holdings Corporation", "ticker": "UWMC", "sector_type": "mortgage", "sec_cik": "0001783398"},
    {"institution_id": "pennymac", "display_name": "PennyMac Financial Services", "ticker": "PFSI", "sector_type": "mortgage", "sec_cik": "0001464423"},
    {"institution_id": "fannie-mae", "display_name": "Fannie Mae (Federal National Mortgage Association)", "ticker": "FNMA", "sector_type": "gse", "sec_cik": "0000310522"},
    {"institution_id": "freddie-mac", "display_name": "Freddie Mac (Federal Home Loan Mortgage)", "ticker": "FMCC", "sector_type": "gse", "sec_cik": "0001026214"},
]


# ============================================================================
# HEALTH — 150+ companies
# ============================================================================

HEALTH_COMPANIES = [
    # ── Top 40 Pharma ──
    {"company_id": "pfizer", "display_name": "Pfizer Inc.", "ticker": "PFE", "sector_type": "pharma", "sec_cik": "0000078003", "fda_manufacturer_name": "PFIZER", "ct_sponsor_name": "Pfizer"},
    {"company_id": "johnson-johnson", "display_name": "Johnson & Johnson", "ticker": "JNJ", "sector_type": "pharma", "sec_cik": "0000200406", "fda_manufacturer_name": "JOHNSON AND JOHNSON", "ct_sponsor_name": "Johnson & Johnson"},
    {"company_id": "abbvie", "display_name": "AbbVie Inc.", "ticker": "ABBV", "sector_type": "pharma", "sec_cik": "0001551152", "fda_manufacturer_name": "ABBVIE", "ct_sponsor_name": "AbbVie"},
    {"company_id": "merck", "display_name": "Merck & Co. Inc.", "ticker": "MRK", "sector_type": "pharma", "sec_cik": "0000310158", "fda_manufacturer_name": "MERCK", "ct_sponsor_name": "Merck Sharp & Dohme LLC"},
    {"company_id": "eli-lilly", "display_name": "Eli Lilly and Company", "ticker": "LLY", "sector_type": "pharma", "sec_cik": "0000059478", "fda_manufacturer_name": "ELI LILLY", "ct_sponsor_name": "Eli Lilly and Company"},
    {"company_id": "bristol-myers-squibb", "display_name": "Bristol-Myers Squibb Company", "ticker": "BMY", "sector_type": "pharma", "sec_cik": "0000014272", "fda_manufacturer_name": "BRISTOL-MYERS SQUIBB", "ct_sponsor_name": "Bristol-Myers Squibb"},
    {"company_id": "roche", "display_name": "Roche Holding AG", "ticker": "RHHBY", "sector_type": "pharma", "sec_cik": None, "fda_manufacturer_name": "ROCHE", "ct_sponsor_name": "Hoffmann-La Roche"},
    {"company_id": "novartis", "display_name": "Novartis AG", "ticker": "NVS", "sector_type": "pharma", "sec_cik": "0001114448", "fda_manufacturer_name": "NOVARTIS", "ct_sponsor_name": "Novartis"},
    {"company_id": "astrazeneca", "display_name": "AstraZeneca PLC", "ticker": "AZN", "sector_type": "pharma", "sec_cik": "0000901832", "fda_manufacturer_name": "ASTRAZENECA", "ct_sponsor_name": "AstraZeneca"},
    {"company_id": "sanofi", "display_name": "Sanofi S.A.", "ticker": "SNY", "sector_type": "pharma", "sec_cik": "0001121404", "fda_manufacturer_name": "SANOFI", "ct_sponsor_name": "Sanofi"},
    {"company_id": "gsk", "display_name": "GSK plc", "ticker": "GSK", "sector_type": "pharma", "sec_cik": "0001131399", "fda_manufacturer_name": "GLAXOSMITHKLINE", "ct_sponsor_name": "GlaxoSmithKline"},
    {"company_id": "novo-nordisk", "display_name": "Novo Nordisk A/S", "ticker": "NVO", "sector_type": "pharma", "sec_cik": "0000353278", "fda_manufacturer_name": "NOVO NORDISK", "ct_sponsor_name": "Novo Nordisk A/S"},
    {"company_id": "amgen", "display_name": "Amgen Inc.", "ticker": "AMGN", "sector_type": "pharma", "sec_cik": "0000318154", "fda_manufacturer_name": "AMGEN", "ct_sponsor_name": "Amgen"},
    {"company_id": "gilead", "display_name": "Gilead Sciences Inc.", "ticker": "GILD", "sector_type": "pharma", "sec_cik": "0000882095", "fda_manufacturer_name": "GILEAD SCIENCES", "ct_sponsor_name": "Gilead Sciences"},
    {"company_id": "regeneron", "display_name": "Regeneron Pharmaceuticals Inc.", "ticker": "REGN", "sector_type": "pharma", "sec_cik": "0000872589", "fda_manufacturer_name": "REGENERON", "ct_sponsor_name": "Regeneron Pharmaceuticals"},
    {"company_id": "vertex", "display_name": "Vertex Pharmaceuticals Inc.", "ticker": "VRTX", "sector_type": "pharma", "sec_cik": "0000875320", "fda_manufacturer_name": "VERTEX", "ct_sponsor_name": "Vertex Pharmaceuticals Incorporated"},
    {"company_id": "bayer", "display_name": "Bayer AG", "ticker": "BAYRY", "sector_type": "pharma", "sec_cik": None, "fda_manufacturer_name": "BAYER", "ct_sponsor_name": "Bayer"},
    {"company_id": "takeda", "display_name": "Takeda Pharmaceutical Company", "ticker": "TAK", "sector_type": "pharma", "sec_cik": "0001581557", "fda_manufacturer_name": "TAKEDA", "ct_sponsor_name": "Takeda"},
    {"company_id": "boehringer-ingelheim", "display_name": "Boehringer Ingelheim", "ticker": None, "sector_type": "pharma", "fda_manufacturer_name": "BOEHRINGER INGELHEIM", "ct_sponsor_name": "Boehringer Ingelheim"},
    {"company_id": "teva", "display_name": "Teva Pharmaceutical Industries", "ticker": "TEVA", "sector_type": "pharma", "sec_cik": "0000818686", "fda_manufacturer_name": "TEVA", "ct_sponsor_name": "Teva Pharmaceutical Industries"},
    {"company_id": "viatris", "display_name": "Viatris Inc.", "ticker": "VTRS", "sector_type": "pharma", "sec_cik": "0001792044", "fda_manufacturer_name": "VIATRIS", "ct_sponsor_name": "Viatris Inc."},
    {"company_id": "organon", "display_name": "Organon & Co.", "ticker": "OGN", "sector_type": "pharma", "sec_cik": "0001821825", "fda_manufacturer_name": "ORGANON", "ct_sponsor_name": "Organon"},
    {"company_id": "jazz-pharma", "display_name": "Jazz Pharmaceuticals plc", "ticker": "JAZZ", "sector_type": "pharma", "sec_cik": "0001232524", "ct_sponsor_name": "Jazz Pharmaceuticals"},
    {"company_id": "biogen", "display_name": "Biogen Inc.", "ticker": "BIIB", "sector_type": "pharma", "sec_cik": "0000875045", "fda_manufacturer_name": "BIOGEN", "ct_sponsor_name": "Biogen"},
    {"company_id": "zoetis", "display_name": "Zoetis Inc.", "ticker": "ZTS", "sector_type": "pharma", "sec_cik": "0001555280", "fda_manufacturer_name": "ZOETIS", "ct_sponsor_name": "Zoetis"},
    {"company_id": "bausch-health", "display_name": "Bausch Health Companies Inc.", "ticker": "BHC", "sector_type": "pharma", "sec_cik": "0000885590", "fda_manufacturer_name": "BAUSCH", "ct_sponsor_name": "Bausch Health"},
    {"company_id": "catalent", "display_name": "Catalent Inc.", "ticker": "CTLT", "sector_type": "pharma", "sec_cik": "0001596783", "ct_sponsor_name": "Catalent"},
    {"company_id": "endo-pharma", "display_name": "Endo International plc", "ticker": None, "sector_type": "pharma", "fda_manufacturer_name": "ENDO"},
    {"company_id": "horizon-therapeutics", "display_name": "Horizon Therapeutics (Amgen)", "ticker": None, "sector_type": "pharma", "ct_sponsor_name": "Horizon Therapeutics"},
    {"company_id": "ipsen", "display_name": "Ipsen S.A.", "ticker": None, "sector_type": "pharma", "ct_sponsor_name": "Ipsen"},

    # ── Major Biotech (top 30) ──
    {"company_id": "moderna", "display_name": "Moderna Inc.", "ticker": "MRNA", "sector_type": "biotech", "sec_cik": "0001682852", "fda_manufacturer_name": "MODERNA", "ct_sponsor_name": "ModernaTX, Inc."},
    {"company_id": "illumina", "display_name": "Illumina Inc.", "ticker": "ILMN", "sector_type": "biotech", "sec_cik": "0001110803", "ct_sponsor_name": "Illumina"},
    {"company_id": "seagen", "display_name": "Seagen Inc. (Pfizer)", "ticker": None, "sector_type": "biotech", "ct_sponsor_name": "Seagen Inc."},
    {"company_id": "alexion", "display_name": "Alexion Pharmaceuticals (AstraZeneca)", "ticker": None, "sector_type": "biotech", "fda_manufacturer_name": "ALEXION", "ct_sponsor_name": "Alexion Pharmaceuticals"},
    {"company_id": "biontech", "display_name": "BioNTech SE", "ticker": "BNTX", "sector_type": "biotech", "sec_cik": "0001776985", "ct_sponsor_name": "BioNTech SE"},
    {"company_id": "alnylam", "display_name": "Alnylam Pharmaceuticals Inc.", "ticker": "ALNY", "sector_type": "biotech", "sec_cik": "0001178670", "ct_sponsor_name": "Alnylam Pharmaceuticals"},
    {"company_id": "argenx", "display_name": "argenx SE", "ticker": "ARGX", "sector_type": "biotech", "sec_cik": "0001697862", "ct_sponsor_name": "argenx"},
    {"company_id": "biomarin", "display_name": "BioMarin Pharmaceutical Inc.", "ticker": "BMRN", "sector_type": "biotech", "sec_cik": "0001048477", "fda_manufacturer_name": "BIOMARIN", "ct_sponsor_name": "BioMarin Pharmaceutical"},
    {"company_id": "incyte", "display_name": "Incyte Corporation", "ticker": "INCY", "sector_type": "biotech", "sec_cik": "0000879169", "ct_sponsor_name": "Incyte Corporation"},
    {"company_id": "neurocrine", "display_name": "Neurocrine Biosciences Inc.", "ticker": "NBIX", "sector_type": "biotech", "sec_cik": "0000914475", "ct_sponsor_name": "Neurocrine Biosciences"},
    {"company_id": "sarepta", "display_name": "Sarepta Therapeutics Inc.", "ticker": "SRPT", "sector_type": "biotech", "sec_cik": "0000801628", "ct_sponsor_name": "Sarepta Therapeutics, Inc."},
    {"company_id": "exelixis", "display_name": "Exelixis Inc.", "ticker": "EXEL", "sector_type": "biotech", "sec_cik": "0000939767", "ct_sponsor_name": "Exelixis"},
    {"company_id": "halozyme", "display_name": "Halozyme Therapeutics Inc.", "ticker": "HALO", "sector_type": "biotech", "sec_cik": "0001159036", "ct_sponsor_name": "Halozyme Therapeutics"},
    {"company_id": "united-therapeutics", "display_name": "United Therapeutics Corporation", "ticker": "UTHR", "sector_type": "biotech", "sec_cik": "0000896264", "ct_sponsor_name": "United Therapeutics"},
    {"company_id": "ionis", "display_name": "Ionis Pharmaceuticals Inc.", "ticker": "IONS", "sector_type": "biotech", "sec_cik": "0000936395", "ct_sponsor_name": "Ionis Pharmaceuticals, Inc."},
    {"company_id": "exact-sciences", "display_name": "Exact Sciences Corporation", "ticker": "EXAS", "sector_type": "biotech", "sec_cik": "0001124140", "ct_sponsor_name": "Exact Sciences Corporation"},
    {"company_id": "natera", "display_name": "Natera Inc.", "ticker": "NTRA", "sector_type": "biotech", "sec_cik": "0001604821", "ct_sponsor_name": "Natera, Inc."},
    {"company_id": "10x-genomics", "display_name": "10x Genomics Inc.", "ticker": "TXG", "sector_type": "biotech", "sec_cik": "0001770787"},
    {"company_id": "crispr-therapeutics", "display_name": "CRISPR Therapeutics AG", "ticker": "CRSP", "sector_type": "biotech", "sec_cik": "0001674416", "ct_sponsor_name": "CRISPR Therapeutics AG"},
    {"company_id": "intellia", "display_name": "Intellia Therapeutics Inc.", "ticker": "NTLA", "sector_type": "biotech", "sec_cik": "0001652130", "ct_sponsor_name": "Intellia Therapeutics, Inc."},
    {"company_id": "beam-therapeutics", "display_name": "Beam Therapeutics Inc.", "ticker": "BEAM", "sector_type": "biotech", "sec_cik": "0001745999", "ct_sponsor_name": "Beam Therapeutics Inc."},

    # ── Medical Devices (top 20) ──
    {"company_id": "medtronic", "display_name": "Medtronic plc", "ticker": "MDT", "sector_type": "devices", "sec_cik": "0001613103", "fda_manufacturer_name": "MEDTRONIC", "ct_sponsor_name": "Medtronic"},
    {"company_id": "abbott", "display_name": "Abbott Laboratories", "ticker": "ABT", "sector_type": "devices", "sec_cik": "0000001800", "fda_manufacturer_name": "ABBOTT", "ct_sponsor_name": "Abbott"},
    {"company_id": "thermo-fisher", "display_name": "Thermo Fisher Scientific Inc.", "ticker": "TMO", "sector_type": "devices", "sec_cik": "0000097745", "ct_sponsor_name": "Thermo Fisher Scientific"},
    {"company_id": "danaher", "display_name": "Danaher Corporation", "ticker": "DHR", "sector_type": "devices", "sec_cik": "0000313616", "ct_sponsor_name": "Danaher Corporation"},
    {"company_id": "becton-dickinson", "display_name": "Becton, Dickinson and Company", "ticker": "BDX", "sector_type": "devices", "sec_cik": "0000010795", "fda_manufacturer_name": "BECTON DICKINSON", "ct_sponsor_name": "Becton, Dickinson and Company"},
    {"company_id": "stryker", "display_name": "Stryker Corporation", "ticker": "SYK", "sector_type": "devices", "sec_cik": "0000310764", "fda_manufacturer_name": "STRYKER", "ct_sponsor_name": "Stryker"},
    {"company_id": "boston-scientific", "display_name": "Boston Scientific Corporation", "ticker": "BSX", "sector_type": "devices", "sec_cik": "0000885725", "fda_manufacturer_name": "BOSTON SCIENTIFIC", "ct_sponsor_name": "Boston Scientific Corporation"},
    {"company_id": "edwards-lifesciences", "display_name": "Edwards Lifesciences Corporation", "ticker": "EW", "sector_type": "devices", "sec_cik": "0001099800", "fda_manufacturer_name": "EDWARDS LIFESCIENCES", "ct_sponsor_name": "Edwards Lifesciences"},
    {"company_id": "intuitive-surgical", "display_name": "Intuitive Surgical Inc.", "ticker": "ISRG", "sector_type": "devices", "sec_cik": "0001035267", "fda_manufacturer_name": "INTUITIVE SURGICAL", "ct_sponsor_name": "Intuitive Surgical"},
    {"company_id": "zimmer-biomet", "display_name": "Zimmer Biomet Holdings Inc.", "ticker": "ZBH", "sector_type": "devices", "sec_cik": "0001136869", "fda_manufacturer_name": "ZIMMER BIOMET", "ct_sponsor_name": "Zimmer Biomet"},
    {"company_id": "hologic", "display_name": "Hologic Inc.", "ticker": "HOLX", "sector_type": "devices", "sec_cik": "0000880149", "fda_manufacturer_name": "HOLOGIC", "ct_sponsor_name": "Hologic, Inc."},
    {"company_id": "resmed", "display_name": "ResMed Inc.", "ticker": "RMD", "sector_type": "devices", "sec_cik": "0000943819", "fda_manufacturer_name": "RESMED", "ct_sponsor_name": "ResMed"},
    {"company_id": "baxter", "display_name": "Baxter International Inc.", "ticker": "BAX", "sector_type": "devices", "sec_cik": "0000010456", "fda_manufacturer_name": "BAXTER", "ct_sponsor_name": "Baxter Healthcare Corporation"},
    {"company_id": "agilent", "display_name": "Agilent Technologies Inc.", "ticker": "A", "sector_type": "devices", "sec_cik": "0001047469"},
    {"company_id": "teleflex", "display_name": "Teleflex Incorporated", "ticker": "TFX", "sector_type": "devices", "sec_cik": "0000912057", "fda_manufacturer_name": "TELEFLEX"},
    {"company_id": "ge-healthcare", "display_name": "GE HealthCare Technologies Inc.", "ticker": "GEHC", "sector_type": "devices", "sec_cik": "0001932393", "fda_manufacturer_name": "GE HEALTHCARE", "ct_sponsor_name": "GE Healthcare"},
    {"company_id": "siemens-healthineers", "display_name": "Siemens Healthineers AG", "ticker": "SMMNY", "sector_type": "devices", "fda_manufacturer_name": "SIEMENS"},
    {"company_id": "philips", "display_name": "Koninklijke Philips N.V.", "ticker": "PHG", "sector_type": "devices", "sec_cik": "0000313216", "fda_manufacturer_name": "PHILIPS"},

    # ── Health Insurers (top 15) ──
    {"company_id": "unitedhealth", "display_name": "UnitedHealth Group Incorporated", "ticker": "UNH", "sector_type": "insurer", "sec_cik": "0000731766"},
    {"company_id": "elevance", "display_name": "Elevance Health Inc. (Anthem)", "ticker": "ELV", "sector_type": "insurer", "sec_cik": "0001156039"},
    {"company_id": "cigna", "display_name": "The Cigna Group", "ticker": "CI", "sector_type": "insurer", "sec_cik": "0001739940"},
    {"company_id": "humana", "display_name": "Humana Inc.", "ticker": "HUM", "sector_type": "insurer", "sec_cik": "0000049071"},
    {"company_id": "centene", "display_name": "Centene Corporation", "ticker": "CNC", "sector_type": "insurer", "sec_cik": "0001071739"},
    {"company_id": "molina", "display_name": "Molina Healthcare Inc.", "ticker": "MOH", "sector_type": "insurer", "sec_cik": "0001179929"},
    {"company_id": "cvs-health", "display_name": "CVS Health Corporation", "ticker": "CVS", "sector_type": "insurer", "sec_cik": "0000064803", "fda_manufacturer_name": "CVS"},
    {"company_id": "aetna", "display_name": "Aetna Inc. (CVS Health)", "ticker": None, "sector_type": "insurer"},
    {"company_id": "kaiser-permanente", "display_name": "Kaiser Foundation Health Plan", "ticker": None, "sector_type": "insurer"},
    {"company_id": "caresource", "display_name": "CareSource", "ticker": None, "sector_type": "insurer"},
    {"company_id": "bright-health", "display_name": "Bright Health Group Inc.", "ticker": None, "sector_type": "insurer", "sec_cik": "0001835488"},
    {"company_id": "oscar-health", "display_name": "Oscar Health Inc.", "ticker": "OSCR", "sector_type": "insurer", "sec_cik": "0001568651"},
    {"company_id": "clover-health", "display_name": "Clover Health Investments", "ticker": "CLOV", "sector_type": "insurer", "sec_cik": "0001801170"},

    # ── Hospital/Healthcare Systems (top 15) ──
    {"company_id": "hca", "display_name": "HCA Healthcare Inc.", "ticker": "HCA", "sector_type": "provider", "sec_cik": "0000860730"},
    {"company_id": "community-health", "display_name": "Community Health Systems Inc.", "ticker": "CYH", "sector_type": "provider", "sec_cik": "0001108109"},
    {"company_id": "tenet", "display_name": "Tenet Healthcare Corporation", "ticker": "THC", "sector_type": "provider", "sec_cik": "0000070318"},
    {"company_id": "universal-health", "display_name": "Universal Health Services Inc.", "ticker": "UHS", "sector_type": "provider", "sec_cik": "0000352915"},
    {"company_id": "encompass-health", "display_name": "Encompass Health Corporation", "ticker": "EHC", "sector_type": "provider", "sec_cik": "0000785161"},
    {"company_id": "acadia-healthcare", "display_name": "Acadia Healthcare Company Inc.", "ticker": "ACHC", "sector_type": "provider", "sec_cik": "0001520697"},
    {"company_id": "amedisys", "display_name": "Amedisys Inc.", "ticker": "AMED", "sector_type": "provider", "sec_cik": "0000014846"},
    {"company_id": "davita", "display_name": "DaVita Inc.", "ticker": "DVA", "sector_type": "provider", "sec_cik": "0000927066"},
    {"company_id": "surgery-partners", "display_name": "Surgery Partners Inc.", "ticker": "SGRY", "sector_type": "provider", "sec_cik": "0001638833"},

    # ── Pharmacy / Distribution ──
    {"company_id": "mckesson", "display_name": "McKesson Corporation", "ticker": "MCK", "sector_type": "distributor", "sec_cik": "0000927653"},
    {"company_id": "amerisourcebergen", "display_name": "Cencora Inc. (AmerisourceBergen)", "ticker": "COR", "sector_type": "distributor", "sec_cik": "0001140859"},
    {"company_id": "cardinal-health", "display_name": "Cardinal Health Inc.", "ticker": "CAH", "sector_type": "distributor", "sec_cik": "0000721371"},
    {"company_id": "walgreens", "display_name": "Walgreens Boots Alliance Inc.", "ticker": "WBA", "sector_type": "pharmacy", "sec_cik": "0001618921", "fda_manufacturer_name": "WALGREENS"},
    {"company_id": "rite-aid", "display_name": "Rite Aid Corporation", "ticker": None, "sector_type": "pharmacy", "fda_manufacturer_name": "RITE AID"},

    # ── Health Tech / Services ──
    {"company_id": "veeva-systems", "display_name": "Veeva Systems Inc.", "ticker": "VEEV", "sector_type": "health_tech", "sec_cik": "0001393052"},
    {"company_id": "iqvia", "display_name": "IQVIA Holdings Inc.", "ticker": "IQV", "sector_type": "health_tech", "sec_cik": "0001667950"},
    {"company_id": "charles-river", "display_name": "Charles River Laboratories", "ticker": "CRL", "sector_type": "health_tech", "sec_cik": "0001100682"},
    {"company_id": "icon-plc", "display_name": "ICON plc", "ticker": "ICLR", "sector_type": "health_tech", "sec_cik": "0001060349"},
    {"company_id": "west-pharma", "display_name": "West Pharmaceutical Services", "ticker": "WST", "sector_type": "health_tech", "sec_cik": "0000105770"},
    {"company_id": "teladoc", "display_name": "Teladoc Health Inc.", "ticker": "TDOC", "sector_type": "health_tech", "sec_cik": "0001477449"},
]


# ============================================================================
# TECH — 200+ companies
# ============================================================================

TECH_COMPANIES = [
    # ── Mega-Cap Platform / Software ──
    {"company_id": "apple", "display_name": "Apple Inc.", "ticker": "AAPL", "sector_type": "platform", "sec_cik": "0000320193", "uspto_assignee_name": "Apple Inc.", "usaspending_recipient_name": "APPLE INC."},
    {"company_id": "microsoft", "display_name": "Microsoft Corporation", "ticker": "MSFT", "sector_type": "platform", "sec_cik": "0000789019", "uspto_assignee_name": "Microsoft Technology Licensing, LLC", "usaspending_recipient_name": "MICROSOFT CORPORATION"},
    {"company_id": "alphabet", "display_name": "Alphabet Inc. (Google)", "ticker": "GOOGL", "sector_type": "platform", "sec_cik": "0001652044", "uspto_assignee_name": "Google LLC", "usaspending_recipient_name": "GOOGLE LLC"},
    {"company_id": "amazon", "display_name": "Amazon.com Inc.", "ticker": "AMZN", "sector_type": "platform", "sec_cik": "0001018724", "uspto_assignee_name": "Amazon Technologies, Inc.", "usaspending_recipient_name": "AMAZON WEB SERVICES INC"},
    {"company_id": "meta", "display_name": "Meta Platforms Inc.", "ticker": "META", "sector_type": "platform", "sec_cik": "0001326801", "uspto_assignee_name": "Meta Platforms, Inc."},
    {"company_id": "nvidia", "display_name": "NVIDIA Corporation", "ticker": "NVDA", "sector_type": "semiconductor", "sec_cik": "0001045810", "uspto_assignee_name": "NVIDIA Corporation"},
    {"company_id": "tesla", "display_name": "Tesla Inc.", "ticker": "TSLA", "sector_type": "automotive", "sec_cik": "0001318605", "uspto_assignee_name": "Tesla, Inc.", "usaspending_recipient_name": "TESLA INC"},
    {"company_id": "netflix", "display_name": "Netflix Inc.", "ticker": "NFLX", "sector_type": "media", "sec_cik": "0001065280"},
    {"company_id": "salesforce", "display_name": "Salesforce Inc.", "ticker": "CRM", "sector_type": "enterprise", "sec_cik": "0001108524", "usaspending_recipient_name": "SALESFORCE INC"},
    {"company_id": "adobe", "display_name": "Adobe Inc.", "ticker": "ADBE", "sector_type": "enterprise", "sec_cik": "0000796343", "uspto_assignee_name": "Adobe Inc."},
    {"company_id": "oracle", "display_name": "Oracle Corporation", "ticker": "ORCL", "sector_type": "enterprise", "sec_cik": "0001341439", "usaspending_recipient_name": "ORACLE CORPORATION"},
    {"company_id": "ibm", "display_name": "International Business Machines", "ticker": "IBM", "sector_type": "enterprise", "sec_cik": "0000051143", "uspto_assignee_name": "International Business Machines Corporation", "usaspending_recipient_name": "INTERNATIONAL BUSINESS MACHINES CORPORATION"},
    {"company_id": "cisco", "display_name": "Cisco Systems Inc.", "ticker": "CSCO", "sector_type": "enterprise", "sec_cik": "0000858877", "uspto_assignee_name": "Cisco Technology, Inc.", "usaspending_recipient_name": "CISCO SYSTEMS INC"},
    {"company_id": "intel", "display_name": "Intel Corporation", "ticker": "INTC", "sector_type": "semiconductor", "sec_cik": "0000050863", "uspto_assignee_name": "Intel Corporation", "usaspending_recipient_name": "INTEL CORPORATION"},
    {"company_id": "amd", "display_name": "Advanced Micro Devices Inc.", "ticker": "AMD", "sector_type": "semiconductor", "sec_cik": "0000002488", "uspto_assignee_name": "Advanced Micro Devices, Inc."},
    {"company_id": "broadcom", "display_name": "Broadcom Inc.", "ticker": "AVGO", "sector_type": "semiconductor", "sec_cik": "0001649338", "uspto_assignee_name": "Broadcom International Pte. Ltd."},
    {"company_id": "qualcomm", "display_name": "QUALCOMM Incorporated", "ticker": "QCOM", "sector_type": "semiconductor", "sec_cik": "0000804328", "uspto_assignee_name": "Qualcomm Incorporated"},
    {"company_id": "texas-instruments", "display_name": "Texas Instruments Incorporated", "ticker": "TXN", "sector_type": "semiconductor", "sec_cik": "0000097476", "uspto_assignee_name": "Texas Instruments Incorporated"},

    # ── Enterprise / SaaS ──
    {"company_id": "servicenow", "display_name": "ServiceNow Inc.", "ticker": "NOW", "sector_type": "enterprise", "sec_cik": "0001373715"},
    {"company_id": "intuit", "display_name": "Intuit Inc.", "ticker": "INTU", "sector_type": "enterprise", "sec_cik": "0000896878"},
    {"company_id": "workday", "display_name": "Workday Inc.", "ticker": "WDAY", "sector_type": "enterprise", "sec_cik": "0001327811"},
    {"company_id": "palo-alto", "display_name": "Palo Alto Networks Inc.", "ticker": "PANW", "sector_type": "cybersecurity", "sec_cik": "0001327567", "usaspending_recipient_name": "PALO ALTO NETWORKS INC"},
    {"company_id": "crowdstrike", "display_name": "CrowdStrike Holdings Inc.", "ticker": "CRWD", "sector_type": "cybersecurity", "sec_cik": "0001535527"},
    {"company_id": "fortinet", "display_name": "Fortinet Inc.", "ticker": "FTNT", "sector_type": "cybersecurity", "sec_cik": "0001262039"},
    {"company_id": "zscaler", "display_name": "Zscaler Inc.", "ticker": "ZS", "sector_type": "cybersecurity", "sec_cik": "0001713683"},
    {"company_id": "datadog", "display_name": "Datadog Inc.", "ticker": "DDOG", "sector_type": "enterprise", "sec_cik": "0001561550"},
    {"company_id": "snowflake", "display_name": "Snowflake Inc.", "ticker": "SNOW", "sector_type": "enterprise", "sec_cik": "0001640147"},
    {"company_id": "palantir", "display_name": "Palantir Technologies Inc.", "ticker": "PLTR", "sector_type": "enterprise", "sec_cik": "0001321655", "usaspending_recipient_name": "PALANTIR TECHNOLOGIES INC"},
    {"company_id": "splunk", "display_name": "Splunk Inc. (Cisco)", "ticker": None, "sector_type": "enterprise", "sec_cik": "0001353283"},
    {"company_id": "twilio", "display_name": "Twilio Inc.", "ticker": "TWLO", "sector_type": "enterprise", "sec_cik": "0001447669"},
    {"company_id": "hubspot", "display_name": "HubSpot Inc.", "ticker": "HUBS", "sector_type": "enterprise", "sec_cik": "0001404655"},
    {"company_id": "atlassian", "display_name": "Atlassian Corporation", "ticker": "TEAM", "sector_type": "enterprise", "sec_cik": "0001650372"},
    {"company_id": "mongodb", "display_name": "MongoDB Inc.", "ticker": "MDB", "sector_type": "enterprise", "sec_cik": "0001441816"},
    {"company_id": "cloudflare", "display_name": "Cloudflare Inc.", "ticker": "NET", "sector_type": "enterprise", "sec_cik": "0001477333"},
    {"company_id": "okta", "display_name": "Okta Inc.", "ticker": "OKTA", "sector_type": "cybersecurity", "sec_cik": "0001660134"},
    {"company_id": "elastic", "display_name": "Elastic N.V.", "ticker": "ESTC", "sector_type": "enterprise", "sec_cik": "0001707753"},
    {"company_id": "dynatrace", "display_name": "Dynatrace Inc.", "ticker": "DT", "sector_type": "enterprise", "sec_cik": "0001773383"},
    {"company_id": "confluent", "display_name": "Confluent Inc.", "ticker": "CFLT", "sector_type": "enterprise", "sec_cik": "0001777921"},
    {"company_id": "gitlab", "display_name": "GitLab Inc.", "ticker": "GTLB", "sector_type": "enterprise", "sec_cik": "0001653482"},
    {"company_id": "hashicorp", "display_name": "HashiCorp Inc.", "ticker": "HCP", "sector_type": "enterprise", "sec_cik": "0001720671"},
    {"company_id": "verint", "display_name": "Verint Systems Inc.", "ticker": "VRNT", "sector_type": "enterprise", "sec_cik": "0001166388"},

    # ── Semiconductors (continued) ──
    {"company_id": "tsmc", "display_name": "Taiwan Semiconductor (TSMC)", "ticker": "TSM", "sector_type": "semiconductor", "sec_cik": "0001046179"},
    {"company_id": "asml", "display_name": "ASML Holding N.V.", "ticker": "ASML", "sector_type": "semiconductor", "sec_cik": "0000937966"},
    {"company_id": "applied-materials", "display_name": "Applied Materials Inc.", "ticker": "AMAT", "sector_type": "semiconductor", "sec_cik": "0000006951", "uspto_assignee_name": "Applied Materials, Inc."},
    {"company_id": "lam-research", "display_name": "Lam Research Corporation", "ticker": "LRCX", "sector_type": "semiconductor", "sec_cik": "0000707549"},
    {"company_id": "klac", "display_name": "KLA Corporation", "ticker": "KLAC", "sector_type": "semiconductor", "sec_cik": "0000319201"},
    {"company_id": "marvell", "display_name": "Marvell Technology Inc.", "ticker": "MRVL", "sector_type": "semiconductor", "sec_cik": "0001058290"},
    {"company_id": "analog-devices", "display_name": "Analog Devices Inc.", "ticker": "ADI", "sector_type": "semiconductor", "sec_cik": "0000006281"},
    {"company_id": "micron", "display_name": "Micron Technology Inc.", "ticker": "MU", "sector_type": "semiconductor", "sec_cik": "0000723125"},
    {"company_id": "on-semiconductor", "display_name": "ON Semiconductor Corporation", "ticker": "ON", "sector_type": "semiconductor", "sec_cik": "0000861374"},
    {"company_id": "nxp", "display_name": "NXP Semiconductors N.V.", "ticker": "NXPI", "sector_type": "semiconductor", "sec_cik": "0001413447"},
    {"company_id": "skyworks", "display_name": "Skyworks Solutions Inc.", "ticker": "SWKS", "sector_type": "semiconductor", "sec_cik": "0000004127"},
    {"company_id": "microchip", "display_name": "Microchip Technology Inc.", "ticker": "MCHP", "sector_type": "semiconductor", "sec_cik": "0000827054"},
    {"company_id": "arm-holdings", "display_name": "Arm Holdings plc", "ticker": "ARM", "sector_type": "semiconductor", "sec_cik": "0001973239"},
    {"company_id": "synopsys", "display_name": "Synopsys Inc.", "ticker": "SNPS", "sector_type": "semiconductor", "sec_cik": "0000883241"},
    {"company_id": "cadence", "display_name": "Cadence Design Systems Inc.", "ticker": "CDNS", "sector_type": "semiconductor", "sec_cik": "0000813672"},
    {"company_id": "lattice-semi", "display_name": "Lattice Semiconductor Corporation", "ticker": "LSCC", "sector_type": "semiconductor", "sec_cik": "0000855658"},
    {"company_id": "globalfoundries", "display_name": "GlobalFoundries Inc.", "ticker": "GFS", "sector_type": "semiconductor", "sec_cik": "0001709048"},

    # ── AI / Cloud / Data ──
    {"company_id": "c3ai", "display_name": "C3.ai Inc.", "ticker": "AI", "sector_type": "ai", "sec_cik": "0001577526"},
    {"company_id": "uipath", "display_name": "UiPath Inc.", "ticker": "PATH", "sector_type": "ai", "sec_cik": "0001734722"},
    {"company_id": "samsara", "display_name": "Samsara Inc.", "ticker": "IOT", "sector_type": "iot", "sec_cik": "0001642896"},

    # ── Telecom / Media ──
    {"company_id": "att", "display_name": "AT&T Inc.", "ticker": "T", "sector_type": "telecom", "sec_cik": "0000732717", "usaspending_recipient_name": "AT&T INC."},
    {"company_id": "verizon", "display_name": "Verizon Communications Inc.", "ticker": "VZ", "sector_type": "telecom", "sec_cik": "0000732712", "usaspending_recipient_name": "VERIZON COMMUNICATIONS INC"},
    {"company_id": "t-mobile", "display_name": "T-Mobile US Inc.", "ticker": "TMUS", "sector_type": "telecom", "sec_cik": "0001283699"},
    {"company_id": "comcast", "display_name": "Comcast Corporation", "ticker": "CMCSA", "sector_type": "telecom", "sec_cik": "0001166691"},
    {"company_id": "disney", "display_name": "The Walt Disney Company", "ticker": "DIS", "sector_type": "media", "sec_cik": "0001744489"},
    {"company_id": "spotify", "display_name": "Spotify Technology S.A.", "ticker": "SPOT", "sector_type": "media", "sec_cik": "0001639920"},
    {"company_id": "snap", "display_name": "Snap Inc.", "ticker": "SNAP", "sector_type": "media", "sec_cik": "0001564408"},
    {"company_id": "pinterest", "display_name": "Pinterest Inc.", "ticker": "PINS", "sector_type": "media", "sec_cik": "0001562088"},
    {"company_id": "roku", "display_name": "Roku Inc.", "ticker": "ROKU", "sector_type": "media", "sec_cik": "0001428439"},
    {"company_id": "roblox", "display_name": "Roblox Corporation", "ticker": "RBLX", "sector_type": "media", "sec_cik": "0001315098"},

    # ── E-commerce / Consumer Tech ──
    {"company_id": "shopify", "display_name": "Shopify Inc.", "ticker": "SHOP", "sector_type": "ecommerce", "sec_cik": "0001594805"},
    {"company_id": "uber", "display_name": "Uber Technologies Inc.", "ticker": "UBER", "sector_type": "platform", "sec_cik": "0001543151"},
    {"company_id": "lyft", "display_name": "Lyft Inc.", "ticker": "LYFT", "sector_type": "platform", "sec_cik": "0001759509"},
    {"company_id": "airbnb", "display_name": "Airbnb Inc.", "ticker": "ABNB", "sector_type": "platform", "sec_cik": "0001559720"},
    {"company_id": "doordash", "display_name": "DoorDash Inc.", "ticker": "DASH", "sector_type": "platform", "sec_cik": "0001792789"},
    {"company_id": "ebay", "display_name": "eBay Inc.", "ticker": "EBAY", "sector_type": "ecommerce", "sec_cik": "0001065088"},
    {"company_id": "etsy", "display_name": "Etsy Inc.", "ticker": "ETSY", "sector_type": "ecommerce", "sec_cik": "0001370637"},
    {"company_id": "mercadolibre", "display_name": "MercadoLibre Inc.", "ticker": "MELI", "sector_type": "ecommerce", "sec_cik": "0001099590"},

    # ── Defense / Gov Tech ──
    {"company_id": "raytheon", "display_name": "RTX Corporation (Raytheon)", "ticker": "RTX", "sector_type": "defense", "sec_cik": "0000101829", "usaspending_recipient_name": "RAYTHEON COMPANY"},
    {"company_id": "lockheed-martin", "display_name": "Lockheed Martin Corporation", "ticker": "LMT", "sector_type": "defense", "sec_cik": "0000936468", "usaspending_recipient_name": "LOCKHEED MARTIN CORPORATION"},
    {"company_id": "northrop-grumman", "display_name": "Northrop Grumman Corporation", "ticker": "NOC", "sector_type": "defense", "sec_cik": "0001133421", "usaspending_recipient_name": "NORTHROP GRUMMAN CORPORATION"},
    {"company_id": "general-dynamics", "display_name": "General Dynamics Corporation", "ticker": "GD", "sector_type": "defense", "sec_cik": "0000040533", "usaspending_recipient_name": "GENERAL DYNAMICS CORPORATION"},
    {"company_id": "l3harris", "display_name": "L3Harris Technologies Inc.", "ticker": "LHX", "sector_type": "defense", "sec_cik": "0000202058", "usaspending_recipient_name": "L3HARRIS TECHNOLOGIES INC"},
    {"company_id": "bae-systems", "display_name": "BAE Systems plc", "ticker": "BAESY", "sector_type": "defense", "usaspending_recipient_name": "BAE SYSTEMS"},
    {"company_id": "booz-allen", "display_name": "Booz Allen Hamilton Holding", "ticker": "BAH", "sector_type": "defense", "sec_cik": "0001443646", "usaspending_recipient_name": "BOOZ ALLEN HAMILTON INC"},
    {"company_id": "leidos", "display_name": "Leidos Holdings Inc.", "ticker": "LDOS", "sector_type": "defense", "sec_cik": "0001336920", "usaspending_recipient_name": "LEIDOS INC"},
    {"company_id": "saic", "display_name": "Science Applications International", "ticker": "SAIC", "sector_type": "defense", "sec_cik": "0001571123", "usaspending_recipient_name": "SCIENCE APPLICATIONS INTERNATIONAL CORPORATION"},
    {"company_id": "anduril", "display_name": "Anduril Industries", "ticker": None, "sector_type": "defense"},

    # ── Hardware / IT Infra ──
    {"company_id": "hp-inc", "display_name": "HP Inc.", "ticker": "HPQ", "sector_type": "hardware", "sec_cik": "0000047217", "usaspending_recipient_name": "HP INC"},
    {"company_id": "hpe", "display_name": "Hewlett Packard Enterprise", "ticker": "HPE", "sector_type": "hardware", "sec_cik": "0001645590", "usaspending_recipient_name": "HEWLETT PACKARD ENTERPRISE COMPANY"},
    {"company_id": "dell", "display_name": "Dell Technologies Inc.", "ticker": "DELL", "sector_type": "hardware", "sec_cik": "0001571996", "usaspending_recipient_name": "DELL TECHNOLOGIES INC"},
    {"company_id": "arista", "display_name": "Arista Networks Inc.", "ticker": "ANET", "sector_type": "hardware", "sec_cik": "0001313545"},
    {"company_id": "netapp", "display_name": "NetApp Inc.", "ticker": "NTAP", "sector_type": "hardware", "sec_cik": "0001002047"},
    {"company_id": "pure-storage", "display_name": "Pure Storage Inc.", "ticker": "PSTG", "sector_type": "hardware", "sec_cik": "0001474432"},
    {"company_id": "western-digital", "display_name": "Western Digital Corporation", "ticker": "WDC", "sector_type": "hardware", "sec_cik": "0000106040"},
    {"company_id": "seagate", "display_name": "Seagate Technology Holdings", "ticker": "STX", "sector_type": "hardware", "sec_cik": "0001137789"},
    {"company_id": "motorola", "display_name": "Motorola Solutions Inc.", "ticker": "MSI", "sector_type": "hardware", "sec_cik": "0000068505", "usaspending_recipient_name": "MOTOROLA SOLUTIONS INC"},
    {"company_id": "garmin", "display_name": "Garmin Ltd.", "ticker": "GRMN", "sector_type": "hardware", "sec_cik": "0001121788"},
    {"company_id": "zebra", "display_name": "Zebra Technologies Corporation", "ticker": "ZBRA", "sector_type": "hardware", "sec_cik": "0000820738"},
    {"company_id": "super-micro", "display_name": "Super Micro Computer Inc.", "ticker": "SMCI", "sector_type": "hardware", "sec_cik": "0001375365"},
]


# ============================================================================
# ENERGY — 80+ companies (extending existing 41 in sync_energy_data.py)
# ============================================================================

ENERGY_COMPANIES = [
    # ── Oil & Gas Majors ──
    {"company_id": "exxonmobil", "display_name": "ExxonMobil Corporation", "ticker": "XOM", "sector_type": "oil_gas", "sec_cik": "0000034088"},
    {"company_id": "chevron", "display_name": "Chevron Corporation", "ticker": "CVX", "sector_type": "oil_gas", "sec_cik": "0000093410"},
    {"company_id": "conocophillips", "display_name": "ConocoPhillips", "ticker": "COP", "sector_type": "oil_gas", "sec_cik": "0001163165"},
    {"company_id": "phillips66", "display_name": "Phillips 66", "ticker": "PSX", "sector_type": "oil_gas", "sec_cik": "0001534701"},
    {"company_id": "marathon-petroleum", "display_name": "Marathon Petroleum Corporation", "ticker": "MPC", "sector_type": "oil_gas", "sec_cik": "0001510295"},
    {"company_id": "valero", "display_name": "Valero Energy Corporation", "ticker": "VLO", "sector_type": "oil_gas", "sec_cik": "0001035002"},
    {"company_id": "eog-resources", "display_name": "EOG Resources Inc.", "ticker": "EOG", "sector_type": "oil_gas", "sec_cik": "0000821189"},
    {"company_id": "pioneer-natural", "display_name": "Pioneer Natural Resources", "ticker": "PXD", "sector_type": "oil_gas", "sec_cik": "0001038357"},
    {"company_id": "devon-energy", "display_name": "Devon Energy Corporation", "ticker": "DVN", "sector_type": "oil_gas", "sec_cik": "0000046619"},
    {"company_id": "hess", "display_name": "Hess Corporation", "ticker": "HES", "sector_type": "oil_gas", "sec_cik": "0000004447"},
    {"company_id": "diamondback", "display_name": "Diamondback Energy Inc.", "ticker": "FANG", "sector_type": "oil_gas", "sec_cik": "0001539838"},
    {"company_id": "coterra", "display_name": "Coterra Energy Inc.", "ticker": "CTRA", "sector_type": "oil_gas", "sec_cik": "0000858470"},
    {"company_id": "occidental", "display_name": "Occidental Petroleum Corporation", "ticker": "OXY", "sector_type": "oil_gas", "sec_cik": "0000797468"},
    {"company_id": "marathon-oil", "display_name": "Marathon Oil Corporation", "ticker": "MRO", "sector_type": "oil_gas", "sec_cik": "0000101778"},
    {"company_id": "apa-corp", "display_name": "APA Corporation (Apache)", "ticker": "APA", "sector_type": "oil_gas", "sec_cik": "0000006769"},
    {"company_id": "murphy-oil", "display_name": "Murphy Oil Corporation", "ticker": "MUR", "sector_type": "oil_gas", "sec_cik": "0000008440"},
    {"company_id": "ovintiv", "display_name": "Ovintiv Inc.", "ticker": "OVV", "sector_type": "oil_gas", "sec_cik": "0000012400"},
    {"company_id": "range-resources", "display_name": "Range Resources Corporation", "ticker": "RRC", "sector_type": "oil_gas", "sec_cik": "0000315852"},
    {"company_id": "southwestern-energy", "display_name": "Southwestern Energy Company", "ticker": "SWN", "sector_type": "oil_gas", "sec_cik": "0000007332"},
    {"company_id": "eq-resources", "display_name": "EQT Corporation", "ticker": "EQT", "sector_type": "oil_gas", "sec_cik": "0000033213"},
    {"company_id": "antero-resources", "display_name": "Antero Resources Corporation", "ticker": "AR", "sector_type": "oil_gas", "sec_cik": "0001433270"},
    {"company_id": "chesapeake-energy", "display_name": "Chesapeake Energy Corporation", "ticker": "CHK", "sector_type": "oil_gas", "sec_cik": "0000895126"},
    {"company_id": "permian-resources", "display_name": "Permian Resources Corporation", "ticker": "PR", "sector_type": "oil_gas", "sec_cik": "0001722438"},
    {"company_id": "civitas-resources", "display_name": "Civitas Resources Inc.", "ticker": "CIVI", "sector_type": "oil_gas", "sec_cik": "0001370928"},
    {"company_id": "magnolia-oil", "display_name": "Magnolia Oil & Gas Corporation", "ticker": "MGY", "sector_type": "oil_gas", "sec_cik": "0001748926"},
    {"company_id": "delek-us", "display_name": "Delek US Holdings Inc.", "ticker": "DK", "sector_type": "oil_gas", "sec_cik": "0001694426"},
    {"company_id": "par-pacific", "display_name": "Par Pacific Holdings Inc.", "ticker": "PARR", "sector_type": "oil_gas", "sec_cik": "0000076321"},
    {"company_id": "pbf-energy", "display_name": "PBF Energy Inc.", "ticker": "PBF", "sector_type": "oil_gas", "sec_cik": "0001534504"},
    {"company_id": "holly-frontier", "display_name": "HF Sinclair Corporation", "ticker": "DINO", "sector_type": "oil_gas", "sec_cik": "0000048039"},

    # International Majors (US-listed)
    {"company_id": "shell", "display_name": "Shell plc", "ticker": "SHEL", "sector_type": "oil_gas", "sec_cik": "0001306965"},
    {"company_id": "bp", "display_name": "BP p.l.c.", "ticker": "BP", "sector_type": "oil_gas", "sec_cik": "0000313807"},
    {"company_id": "totalenergies", "display_name": "TotalEnergies SE", "ticker": "TTE", "sector_type": "oil_gas", "sec_cik": "0000879764"},
    {"company_id": "petrobras", "display_name": "Petroleo Brasileiro S.A. (Petrobras)", "ticker": "PBR", "sector_type": "oil_gas", "sec_cik": "0001119639"},
    {"company_id": "equinor", "display_name": "Equinor ASA", "ticker": "EQNR", "sector_type": "oil_gas", "sec_cik": "0001163334"},
    {"company_id": "eni", "display_name": "Eni S.p.A.", "ticker": "E", "sector_type": "oil_gas", "sec_cik": "0000879764"},

    # ── Utilities (continued) ──
    {"company_id": "nextera", "display_name": "NextEra Energy Inc.", "ticker": "NEE", "sector_type": "utility", "sec_cik": "0000753308"},
    {"company_id": "duke-energy", "display_name": "Duke Energy Corporation", "ticker": "DUK", "sector_type": "utility", "sec_cik": "0001326160"},
    {"company_id": "southern-company", "display_name": "The Southern Company", "ticker": "SO", "sector_type": "utility", "sec_cik": "0000092122"},
    {"company_id": "dominion-energy", "display_name": "Dominion Energy Inc.", "ticker": "D", "sector_type": "utility", "sec_cik": "0000715957"},
    {"company_id": "american-electric", "display_name": "American Electric Power Co.", "ticker": "AEP", "sector_type": "utility", "sec_cik": "0000004904"},
    {"company_id": "exelon", "display_name": "Exelon Corporation", "ticker": "EXC", "sector_type": "utility", "sec_cik": "0001109357"},
    {"company_id": "sempra", "display_name": "Sempra", "ticker": "SRE", "sector_type": "utility", "sec_cik": "0001032208"},
    {"company_id": "xcel-energy", "display_name": "Xcel Energy Inc.", "ticker": "XEL", "sector_type": "utility", "sec_cik": "0000072903"},
    {"company_id": "entergy", "display_name": "Entergy Corporation", "ticker": "ETR", "sector_type": "utility", "sec_cik": "0000065580"},
    {"company_id": "wec-energy", "display_name": "WEC Energy Group Inc.", "ticker": "WEC", "sector_type": "utility", "sec_cik": "0000783325"},
    {"company_id": "eversource", "display_name": "Eversource Energy", "ticker": "ES", "sector_type": "utility", "sec_cik": "0000072741"},
    {"company_id": "consolidated-edison", "display_name": "Consolidated Edison Inc.", "ticker": "ED", "sector_type": "utility", "sec_cik": "0000023632"},
    {"company_id": "dte-energy", "display_name": "DTE Energy Company", "ticker": "DTE", "sector_type": "utility", "sec_cik": "0000936340"},
    {"company_id": "cms-energy", "display_name": "CMS Energy Corporation", "ticker": "CMS", "sector_type": "utility", "sec_cik": "0000811156"},
    {"company_id": "atmos-energy", "display_name": "Atmos Energy Corporation", "ticker": "ATO", "sector_type": "utility", "sec_cik": "0000731802"},
    {"company_id": "centerpoint", "display_name": "CenterPoint Energy Inc.", "ticker": "CNP", "sector_type": "utility", "sec_cik": "0001130310"},
    {"company_id": "ppg-industries", "display_name": "PPL Corporation", "ticker": "PPL", "sector_type": "utility", "sec_cik": "0000764180"},
    {"company_id": "alliant-energy", "display_name": "Alliant Energy Corporation", "ticker": "LNT", "sector_type": "utility", "sec_cik": "0000352541"},
    {"company_id": "ameren", "display_name": "Ameren Corporation", "ticker": "AEE", "sector_type": "utility", "sec_cik": "0001002910"},
    {"company_id": "nrg-energy", "display_name": "NRG Energy Inc.", "ticker": "NRG", "sector_type": "utility", "sec_cik": "0001013871"},
    {"company_id": "vistra", "display_name": "Vistra Corp.", "ticker": "VST", "sector_type": "utility", "sec_cik": "0001692819"},
    {"company_id": "constellation-energy", "display_name": "Constellation Energy Corporation", "ticker": "CEG", "sector_type": "utility", "sec_cik": "0001868275"},
    {"company_id": "aes-corp", "display_name": "The AES Corporation", "ticker": "AES", "sector_type": "utility", "sec_cik": "0000874761"},
    {"company_id": "avangrid", "display_name": "Avangrid Inc.", "ticker": "AGR", "sector_type": "utility", "sec_cik": "0001634997"},

    # ── Renewables (continued) ──
    {"company_id": "first-solar", "display_name": "First Solar Inc.", "ticker": "FSLR", "sector_type": "renewable", "sec_cik": "0001274494"},
    {"company_id": "enphase", "display_name": "Enphase Energy Inc.", "ticker": "ENPH", "sector_type": "renewable", "sec_cik": "0001463101"},
    {"company_id": "sunrun", "display_name": "Sunrun Inc.", "ticker": "RUN", "sector_type": "renewable", "sec_cik": "0001469367"},
    {"company_id": "plug-power", "display_name": "Plug Power Inc.", "ticker": "PLUG", "sector_type": "renewable", "sec_cik": "0001093691"},
    {"company_id": "brookfield-renewable", "display_name": "Brookfield Renewable Partners", "ticker": "BEP", "sector_type": "renewable", "sec_cik": "0001578318"},
    {"company_id": "clearway-energy", "display_name": "Clearway Energy Inc.", "ticker": "CWEN", "sector_type": "renewable", "sec_cik": "0001567683"},
    {"company_id": "sunnova", "display_name": "Sunnova Energy International", "ticker": "NOVA", "sector_type": "renewable", "sec_cik": "0001772695"},
    {"company_id": "maxeon-solar", "display_name": "Maxeon Solar Technologies", "ticker": "MAXN", "sector_type": "renewable", "sec_cik": "0001796898"},
    {"company_id": "nextracker", "display_name": "Nextracker Inc.", "ticker": "NXT", "sector_type": "renewable", "sec_cik": "0001905956"},
    {"company_id": "stem-inc", "display_name": "Stem Inc.", "ticker": "STEM", "sector_type": "renewable", "sec_cik": "0001301236"},
    {"company_id": "array-technologies", "display_name": "Array Technologies Inc.", "ticker": "ARRY", "sector_type": "renewable", "sec_cik": "0001820721"},
    {"company_id": "shoals-tech", "display_name": "Shoals Technologies Group", "ticker": "SHLS", "sector_type": "renewable", "sec_cik": "0001831651"},

    # ── Pipelines / Midstream ──
    {"company_id": "enbridge", "display_name": "Enbridge Inc.", "ticker": "ENB", "sector_type": "pipeline", "sec_cik": "0000895728"},
    {"company_id": "enterprise-products", "display_name": "Enterprise Products Partners", "ticker": "EPD", "sector_type": "pipeline", "sec_cik": "0000048962"},
    {"company_id": "kinder-morgan", "display_name": "Kinder Morgan Inc.", "ticker": "KMI", "sector_type": "pipeline", "sec_cik": "0001506307"},
    {"company_id": "williams-companies", "display_name": "The Williams Companies Inc.", "ticker": "WMB", "sector_type": "pipeline", "sec_cik": "0000107263"},
    {"company_id": "oneok", "display_name": "ONEOK Inc.", "ticker": "OKE", "sector_type": "pipeline", "sec_cik": "0000275880"},
    {"company_id": "energy-transfer", "display_name": "Energy Transfer LP", "ticker": "ET", "sector_type": "pipeline", "sec_cik": "0001276187"},
    {"company_id": "plains-all-american", "display_name": "Plains All American Pipeline", "ticker": "PAA", "sector_type": "pipeline", "sec_cik": "0001070423"},
    {"company_id": "targa-resources", "display_name": "Targa Resources Corp.", "ticker": "TRGP", "sector_type": "pipeline", "sec_cik": "0001423221"},
    {"company_id": "mplx", "display_name": "MPLX LP", "ticker": "MPLX", "sector_type": "pipeline", "sec_cik": "0001552275"},
    {"company_id": "western-midstream", "display_name": "Western Midstream Partners", "ticker": "WES", "sector_type": "pipeline", "sec_cik": "0001537837"},
    {"company_id": "dtm", "display_name": "DT Midstream Inc.", "ticker": "DTM", "sector_type": "pipeline", "sec_cik": "0001859007"},

    # ── Oilfield Services ──
    {"company_id": "schlumberger", "display_name": "SLB (Schlumberger)", "ticker": "SLB", "sector_type": "services", "sec_cik": "0000087347"},
    {"company_id": "halliburton", "display_name": "Halliburton Company", "ticker": "HAL", "sector_type": "services", "sec_cik": "0000045012"},
    {"company_id": "baker-hughes", "display_name": "Baker Hughes Company", "ticker": "BKR", "sector_type": "services", "sec_cik": "0001701605"},
    {"company_id": "tgs-nopec", "display_name": "TGS-NOPEC Geophysical", "ticker": "TGS", "sector_type": "services", "sec_cik": None},
    {"company_id": "championx", "display_name": "ChampionX Corporation", "ticker": "CHX", "sector_type": "services", "sec_cik": "0001723089"},
    {"company_id": "liberty-energy", "display_name": "Liberty Energy Inc.", "ticker": "LBRT", "sector_type": "services", "sec_cik": "0001694028"},
    {"company_id": "cactus-inc", "display_name": "Cactus Inc.", "ticker": "WHD", "sector_type": "services", "sec_cik": "0001720635"},
]


# ============================================================================
# TRANSPORTATION — 80+ companies
# ============================================================================

TRANSPORTATION_COMPANIES = [
    # ── Airlines ──
    {"company_id": "delta", "display_name": "Delta Air Lines Inc.", "ticker": "DAL", "sector_type": "aviation", "sec_cik": "0000027904", "headquarters": "Atlanta, GA", "usaspending_recipient_name": "DELTA AIR LINES"},
    {"company_id": "united-airlines", "display_name": "United Airlines Holdings Inc.", "ticker": "UAL", "sector_type": "aviation", "sec_cik": "0000100517", "headquarters": "Chicago, IL", "usaspending_recipient_name": "UNITED AIRLINES"},
    {"company_id": "american-airlines", "display_name": "American Airlines Group Inc.", "ticker": "AAL", "sector_type": "aviation", "sec_cik": "0000006201", "headquarters": "Fort Worth, TX", "usaspending_recipient_name": "AMERICAN AIRLINES"},
    {"company_id": "southwest", "display_name": "Southwest Airlines Co.", "ticker": "LUV", "sector_type": "aviation", "sec_cik": "0000092380", "headquarters": "Dallas, TX", "usaspending_recipient_name": "SOUTHWEST AIRLINES"},
    {"company_id": "jetblue", "display_name": "JetBlue Airways Corporation", "ticker": "JBLU", "sector_type": "aviation", "sec_cik": "0000898293", "headquarters": "Long Island City, NY", "usaspending_recipient_name": "JETBLUE AIRWAYS"},
    {"company_id": "alaska-air", "display_name": "Alaska Air Group Inc.", "ticker": "ALK", "sector_type": "aviation", "sec_cik": "0000766421", "headquarters": "Seattle, WA", "usaspending_recipient_name": "ALASKA AIRLINES"},
    {"company_id": "spirit-airlines", "display_name": "Spirit Airlines Inc.", "ticker": "SAVE", "sector_type": "aviation", "sec_cik": "0001498710", "headquarters": "Dania Beach, FL"},
    {"company_id": "frontier-airlines", "display_name": "Frontier Group Holdings Inc.", "ticker": "ULCC", "sector_type": "aviation", "sec_cik": "0001670076", "headquarters": "Denver, CO"},
    {"company_id": "hawaiian-airlines", "display_name": "Hawaiian Holdings Inc.", "ticker": "HA", "sector_type": "aviation", "sec_cik": "0000046619", "headquarters": "Honolulu, HI"},
    {"company_id": "skywest", "display_name": "SkyWest Inc.", "ticker": "SKYW", "sector_type": "aviation", "sec_cik": "0000793735", "headquarters": "St. George, UT"},
    {"company_id": "sun-country", "display_name": "Sun Country Airlines Holdings", "ticker": "SNCY", "sector_type": "aviation", "sec_cik": "0001784535", "headquarters": "Minneapolis, MN"},

    # ── Shipping / Logistics ──
    {"company_id": "fedex", "display_name": "FedEx Corporation", "ticker": "FDX", "sector_type": "logistics", "sec_cik": "0001048911", "headquarters": "Memphis, TN", "usaspending_recipient_name": "FEDERAL EXPRESS"},
    {"company_id": "ups", "display_name": "United Parcel Service Inc.", "ticker": "UPS", "sector_type": "logistics", "sec_cik": "0001090727", "headquarters": "Atlanta, GA", "usaspending_recipient_name": "UNITED PARCEL SERVICE"},
    {"company_id": "xpo-logistics", "display_name": "XPO Inc.", "ticker": "XPO", "sector_type": "logistics", "sec_cik": "0001166003", "headquarters": "Greenwich, CT"},
    {"company_id": "ch-robinson", "display_name": "C.H. Robinson Worldwide Inc.", "ticker": "CHRW", "sector_type": "logistics", "sec_cik": "0001043277", "headquarters": "Eden Prairie, MN"},
    {"company_id": "jb-hunt", "display_name": "J.B. Hunt Transport Services Inc.", "ticker": "JBHT", "sector_type": "logistics", "sec_cik": "0000728535", "headquarters": "Lowell, AR"},
    {"company_id": "old-dominion", "display_name": "Old Dominion Freight Line Inc.", "ticker": "ODFL", "sector_type": "logistics", "sec_cik": "0000878927", "headquarters": "Thomasville, NC"},
    {"company_id": "expeditors", "display_name": "Expeditors International of Washington", "ticker": "EXPD", "sector_type": "logistics", "sec_cik": "0000746515", "headquarters": "Seattle, WA"},
    {"company_id": "werner", "display_name": "Werner Enterprises Inc.", "ticker": "WERN", "sector_type": "logistics", "sec_cik": "0000793074", "headquarters": "Omaha, NE"},
    {"company_id": "ryder", "display_name": "Ryder System Inc.", "ticker": "R", "sector_type": "logistics", "sec_cik": "0000085961", "headquarters": "Coral Gables, FL"},
    {"company_id": "amerco", "display_name": "AMERCO (U-Haul)", "ticker": "UHAL", "sector_type": "logistics", "sec_cik": "0000004457", "headquarters": "Reno, NV"},
    {"company_id": "saia", "display_name": "Saia Inc.", "ticker": "SAIA", "sector_type": "logistics", "sec_cik": "0000082811", "headquarters": "Johns Creek, GA"},
    {"company_id": "landstar", "display_name": "Landstar System Inc.", "ticker": "LSTR", "sector_type": "logistics", "sec_cik": "0000853816", "headquarters": "Jacksonville, FL"},

    # ── Motor Vehicle / Automotive ──
    {"company_id": "general-motors", "display_name": "General Motors Company", "ticker": "GM", "sector_type": "motor_vehicle", "sec_cik": "0001467858", "headquarters": "Detroit, MI", "usaspending_recipient_name": "GENERAL MOTORS"},
    {"company_id": "ford", "display_name": "Ford Motor Company", "ticker": "F", "sector_type": "motor_vehicle", "sec_cik": "0000037996", "headquarters": "Dearborn, MI", "usaspending_recipient_name": "FORD MOTOR"},
    {"company_id": "tesla", "display_name": "Tesla Inc.", "ticker": "TSLA", "sector_type": "motor_vehicle", "sec_cik": "0001318605", "headquarters": "Austin, TX", "usaspending_recipient_name": "TESLA"},
    {"company_id": "stellantis", "display_name": "Stellantis N.V.", "ticker": "STLA", "sector_type": "motor_vehicle", "sec_cik": "0001513153", "headquarters": "Amsterdam, Netherlands", "usaspending_recipient_name": "STELLANTIS"},
    {"company_id": "toyota", "display_name": "Toyota Motor Corporation", "ticker": "TM", "sector_type": "motor_vehicle", "sec_cik": "0001094517", "headquarters": "Toyota City, Japan", "usaspending_recipient_name": "TOYOTA MOTOR"},
    {"company_id": "honda", "display_name": "Honda Motor Co. Ltd.", "ticker": "HMC", "sector_type": "motor_vehicle", "sec_cik": "0000715153", "headquarters": "Tokyo, Japan"},
    {"company_id": "rivian", "display_name": "Rivian Automotive Inc.", "ticker": "RIVN", "sector_type": "motor_vehicle", "sec_cik": "0001874178", "headquarters": "Irvine, CA"},
    {"company_id": "lucid", "display_name": "Lucid Group Inc.", "ticker": "LCID", "sector_type": "motor_vehicle", "sec_cik": "0001811210", "headquarters": "Newark, CA"},
    {"company_id": "nio", "display_name": "NIO Inc.", "ticker": "NIO", "sector_type": "motor_vehicle", "sec_cik": "0001736541", "headquarters": "Shanghai, China"},
    {"company_id": "hyundai", "display_name": "Hyundai Motor Company", "ticker": "HYMTF", "sector_type": "motor_vehicle", "sec_cik": "", "headquarters": "Seoul, South Korea"},
    {"company_id": "volkswagen", "display_name": "Volkswagen AG", "ticker": "VWAGY", "sector_type": "motor_vehicle", "sec_cik": "", "headquarters": "Wolfsburg, Germany"},
    {"company_id": "bmw", "display_name": "Bayerische Motoren Werke AG", "ticker": "BMWYY", "sector_type": "motor_vehicle", "sec_cik": "", "headquarters": "Munich, Germany"},

    # ── Rail ──
    {"company_id": "union-pacific", "display_name": "Union Pacific Corporation", "ticker": "UNP", "sector_type": "rail", "sec_cik": "0000100885", "headquarters": "Omaha, NE", "usaspending_recipient_name": "UNION PACIFIC"},
    {"company_id": "csx", "display_name": "CSX Corporation", "ticker": "CSX", "sector_type": "rail", "sec_cik": "0000277948", "headquarters": "Jacksonville, FL", "usaspending_recipient_name": "CSX"},
    {"company_id": "norfolk-southern", "display_name": "Norfolk Southern Corporation", "ticker": "NSC", "sector_type": "rail", "sec_cik": "0000073309", "headquarters": "Atlanta, GA", "usaspending_recipient_name": "NORFOLK SOUTHERN"},
    {"company_id": "canadian-pacific", "display_name": "Canadian Pacific Kansas City Ltd.", "ticker": "CP", "sector_type": "rail", "sec_cik": "0000016875", "headquarters": "Calgary, Canada"},
    {"company_id": "canadian-national", "display_name": "Canadian National Railway Company", "ticker": "CNI", "sector_type": "rail", "sec_cik": "0001001085", "headquarters": "Montreal, Canada"},
    {"company_id": "wabtec", "display_name": "Westinghouse Air Brake Technologies", "ticker": "WAB", "sector_type": "rail", "sec_cik": "0000943452", "headquarters": "Pittsburgh, PA"},
    {"company_id": "genesee-wyoming", "display_name": "Genesee & Wyoming Inc.", "ticker": None, "sector_type": "rail", "sec_cik": "", "headquarters": "Darien, CT"},

    # ── Ride-share / Delivery ──
    {"company_id": "uber", "display_name": "Uber Technologies Inc.", "ticker": "UBER", "sector_type": "ride_share", "sec_cik": "0001543151", "headquarters": "San Francisco, CA"},
    {"company_id": "lyft", "display_name": "Lyft Inc.", "ticker": "LYFT", "sector_type": "ride_share", "sec_cik": "0001759509", "headquarters": "San Francisco, CA"},
    {"company_id": "doordash", "display_name": "DoorDash Inc.", "ticker": "DASH", "sector_type": "ride_share", "sec_cik": "0001792789", "headquarters": "San Francisco, CA"},
    {"company_id": "instacart", "display_name": "Maplebear Inc. (Instacart)", "ticker": "CART", "sector_type": "ride_share", "sec_cik": "0001579091", "headquarters": "San Francisco, CA"},
    {"company_id": "grab", "display_name": "Grab Holdings Limited", "ticker": "GRAB", "sector_type": "ride_share", "sec_cik": "0001855612", "headquarters": "Singapore"},

    # ── Aerospace / Defense ──
    {"company_id": "boeing", "display_name": "The Boeing Company", "ticker": "BA", "sector_type": "aerospace", "sec_cik": "0000012927", "headquarters": "Arlington, VA", "usaspending_recipient_name": "BOEING"},
    {"company_id": "lockheed-martin", "display_name": "Lockheed Martin Corporation", "ticker": "LMT", "sector_type": "aerospace", "sec_cik": "0000936468", "headquarters": "Bethesda, MD", "usaspending_recipient_name": "LOCKHEED MARTIN"},
    {"company_id": "rtx", "display_name": "RTX Corporation", "ticker": "RTX", "sector_type": "aerospace", "sec_cik": "0000101829", "headquarters": "Arlington, VA", "usaspending_recipient_name": "RTX"},
    {"company_id": "northrop-grumman", "display_name": "Northrop Grumman Corporation", "ticker": "NOC", "sector_type": "aerospace", "sec_cik": "0001133421", "headquarters": "Falls Church, VA", "usaspending_recipient_name": "NORTHROP GRUMMAN"},
    {"company_id": "general-dynamics", "display_name": "General Dynamics Corporation", "ticker": "GD", "sector_type": "aerospace", "sec_cik": "0000040533", "headquarters": "Reston, VA", "usaspending_recipient_name": "GENERAL DYNAMICS"},
    {"company_id": "l3harris", "display_name": "L3Harris Technologies Inc.", "ticker": "LHX", "sector_type": "aerospace", "sec_cik": "0000202058", "headquarters": "Melbourne, FL", "usaspending_recipient_name": "L3HARRIS"},
    {"company_id": "textron", "display_name": "Textron Inc.", "ticker": "TXT", "sector_type": "aerospace", "sec_cik": "0000217346", "headquarters": "Providence, RI", "usaspending_recipient_name": "TEXTRON"},
    {"company_id": "bombardier", "display_name": "Bombardier Inc.", "ticker": "BDRBF", "sector_type": "aerospace", "sec_cik": "", "headquarters": "Montreal, Canada"},
    {"company_id": "airbus", "display_name": "Airbus SE", "ticker": "EADSY", "sector_type": "aerospace", "sec_cik": "", "headquarters": "Leiden, Netherlands"},
    {"company_id": "embraer", "display_name": "Embraer S.A.", "ticker": "ERJ", "sector_type": "aerospace", "sec_cik": "0001078752", "headquarters": "Sao Jose dos Campos, Brazil"},
    {"company_id": "howmet", "display_name": "Howmet Aerospace Inc.", "ticker": "HWM", "sector_type": "aerospace", "sec_cik": "0000004281", "headquarters": "Pittsburgh, PA"},
    {"company_id": "spirit-aerosystems", "display_name": "Spirit AeroSystems Holdings Inc.", "ticker": "SPR", "sector_type": "aerospace", "sec_cik": "0001364885", "headquarters": "Wichita, KS"},
    {"company_id": "transdigm", "display_name": "TransDigm Group Incorporated", "ticker": "TDG", "sector_type": "aerospace", "sec_cik": "0001260221", "headquarters": "Cleveland, OH"},

    # ── Truck / Heavy Equipment ──
    {"company_id": "paccar", "display_name": "PACCAR Inc.", "ticker": "PCAR", "sector_type": "motor_vehicle", "sec_cik": "0000075362", "headquarters": "Bellevue, WA"},
    {"company_id": "cummins", "display_name": "Cummins Inc.", "ticker": "CMI", "sector_type": "motor_vehicle", "sec_cik": "0000026172", "headquarters": "Columbus, IN"},
    {"company_id": "caterpillar", "display_name": "Caterpillar Inc.", "ticker": "CAT", "sector_type": "motor_vehicle", "sec_cik": "0000018230", "headquarters": "Irving, TX"},
    {"company_id": "deere", "display_name": "Deere & Company", "ticker": "DE", "sector_type": "motor_vehicle", "sec_cik": "0000315189", "headquarters": "Moline, IL"},
    {"company_id": "navistar", "display_name": "Navistar International Corporation", "ticker": None, "sector_type": "motor_vehicle", "sec_cik": "0000808450", "headquarters": "Lisle, IL"},
    {"company_id": "allison-transmission", "display_name": "Allison Transmission Holdings", "ticker": "ALSN", "sector_type": "motor_vehicle", "sec_cik": "0001411207", "headquarters": "Indianapolis, IN"},

    # ── Maritime ──
    {"company_id": "carnival", "display_name": "Carnival Corporation", "ticker": "CCL", "sector_type": "maritime", "sec_cik": "0000815097", "headquarters": "Miami, FL"},
    {"company_id": "royal-caribbean", "display_name": "Royal Caribbean Cruises Ltd.", "ticker": "RCL", "sector_type": "maritime", "sec_cik": "0000884887", "headquarters": "Miami, FL"},
    {"company_id": "kirby", "display_name": "Kirby Corporation", "ticker": "KEX", "sector_type": "maritime", "sec_cik": "0000049826", "headquarters": "Houston, TX"},
    {"company_id": "matson", "display_name": "Matson Inc.", "ticker": "MATX", "sector_type": "maritime", "sec_cik": "0000003453", "headquarters": "Honolulu, HI"},
    {"company_id": "norwegian-cruise", "display_name": "Norwegian Cruise Line Holdings", "ticker": "NCLH", "sector_type": "maritime", "sec_cik": "0001513761", "headquarters": "Miami, FL"},
    {"company_id": "zim", "display_name": "ZIM Integrated Shipping Services", "ticker": "ZIM", "sector_type": "maritime", "sec_cik": "0001837014", "headquarters": "Haifa, Israel"},
    {"company_id": "danaos", "display_name": "Danaos Corporation", "ticker": "DAC", "sector_type": "maritime", "sec_cik": "0001372514", "headquarters": "Piraeus, Greece"},
]


# ============================================================================
# DEFENSE — 60+ companies
# ============================================================================

DEFENSE_COMPANIES = [
    # ── Defense Primes ──
    {"company_id": "lockheed-martin", "display_name": "Lockheed Martin Corporation", "ticker": "LMT", "sector_type": "defense_prime", "sec_cik": "0000936468", "headquarters": "Bethesda, MD", "usaspending_recipient_name": "LOCKHEED MARTIN"},
    {"company_id": "rtx", "display_name": "RTX Corporation", "ticker": "RTX", "sector_type": "defense_prime", "sec_cik": "0000101829", "headquarters": "Arlington, VA", "usaspending_recipient_name": "RTX CORPORATION"},
    {"company_id": "boeing-defense", "display_name": "The Boeing Company", "ticker": "BA", "sector_type": "defense_prime", "sec_cik": "0000012927", "headquarters": "Arlington, VA", "usaspending_recipient_name": "BOEING COMPANY"},
    {"company_id": "northrop-grumman", "display_name": "Northrop Grumman Corporation", "ticker": "NOC", "sector_type": "defense_prime", "sec_cik": "0001133421", "headquarters": "Falls Church, VA", "usaspending_recipient_name": "NORTHROP GRUMMAN"},
    {"company_id": "general-dynamics", "display_name": "General Dynamics Corporation", "ticker": "GD", "sector_type": "defense_prime", "sec_cik": "0000040533", "headquarters": "Reston, VA", "usaspending_recipient_name": "GENERAL DYNAMICS"},
    {"company_id": "l3harris", "display_name": "L3Harris Technologies Inc.", "ticker": "LHX", "sector_type": "defense_prime", "sec_cik": "0000202058", "headquarters": "Melbourne, FL", "usaspending_recipient_name": "L3HARRIS TECHNOLOGIES"},
    {"company_id": "bae-systems", "display_name": "BAE Systems plc", "ticker": "BAESY", "sector_type": "defense_prime", "sec_cik": None, "headquarters": "London, UK", "usaspending_recipient_name": "BAE SYSTEMS"},
    {"company_id": "leidos", "display_name": "Leidos Holdings Inc.", "ticker": "LDOS", "sector_type": "defense_prime", "sec_cik": "0001336920", "headquarters": "Reston, VA", "usaspending_recipient_name": "LEIDOS"},
    {"company_id": "huntington-ingalls", "display_name": "Huntington Ingalls Industries Inc.", "ticker": "HII", "sector_type": "defense_prime", "sec_cik": "0001501585", "headquarters": "Newport News, VA", "usaspending_recipient_name": "HUNTINGTON INGALLS"},
    {"company_id": "textron", "display_name": "Textron Inc.", "ticker": "TXT", "sector_type": "defense_prime", "sec_cik": "0000217346", "headquarters": "Providence, RI", "usaspending_recipient_name": "TEXTRON"},

    # ── Defense Subs / Specialists ──
    {"company_id": "caci", "display_name": "CACI International Inc.", "ticker": "CACI", "sector_type": "defense_sub", "sec_cik": "0000016058", "headquarters": "Reston, VA", "usaspending_recipient_name": "CACI INTERNATIONAL"},
    {"company_id": "booz-allen", "display_name": "Booz Allen Hamilton Holding Corp.", "ticker": "BAH", "sector_type": "defense_sub", "sec_cik": "0001443646", "headquarters": "McLean, VA", "usaspending_recipient_name": "BOOZ ALLEN HAMILTON"},
    {"company_id": "mantech", "display_name": "ManTech International Corporation", "ticker": None, "sector_type": "defense_sub", "sec_cik": "0001058290", "headquarters": "Herndon, VA", "usaspending_recipient_name": "MANTECH INTERNATIONAL"},
    {"company_id": "saic", "display_name": "Science Applications International Corp.", "ticker": "SAIC", "sector_type": "defense_sub", "sec_cik": "0001571123", "headquarters": "Reston, VA", "usaspending_recipient_name": "SCIENCE APPLICATIONS INTERNATIONAL"},
    {"company_id": "parsons", "display_name": "Parsons Corporation", "ticker": "PSN", "sector_type": "defense_sub", "sec_cik": "0001665650", "headquarters": "Chantilly, VA", "usaspending_recipient_name": "PARSONS CORPORATION"},
    {"company_id": "kbr", "display_name": "KBR Inc.", "ticker": "KBR", "sector_type": "defense_sub", "sec_cik": "0001357615", "headquarters": "Houston, TX", "usaspending_recipient_name": "KBR"},
    {"company_id": "amentum", "display_name": "Amentum Holdings Inc.", "ticker": "AMTM", "sector_type": "defense_sub", "sec_cik": "0001989548", "headquarters": "Chantilly, VA", "usaspending_recipient_name": "AMENTUM"},
    {"company_id": "vectrus", "display_name": "V2X Inc.", "ticker": "VVX", "sector_type": "defense_sub", "sec_cik": "0001601548", "headquarters": "Colorado Springs, CO", "usaspending_recipient_name": "V2X"},
    {"company_id": "bwx-technologies", "display_name": "BWX Technologies Inc.", "ticker": "BWXT", "sector_type": "defense_sub", "sec_cik": "0000071328", "headquarters": "Lynchburg, VA", "usaspending_recipient_name": "BWX TECHNOLOGIES"},
    {"company_id": "maxar", "display_name": "Maxar Technologies", "ticker": None, "sector_type": "defense_sub", "sec_cik": "0001121142", "headquarters": "Westminster, CO", "usaspending_recipient_name": "MAXAR TECHNOLOGIES"},

    # ── Cybersecurity / Intelligence ──
    {"company_id": "palantir", "display_name": "Palantir Technologies Inc.", "ticker": "PLTR", "sector_type": "cybersecurity", "sec_cik": "0001321655", "headquarters": "Denver, CO", "usaspending_recipient_name": "PALANTIR TECHNOLOGIES"},
    {"company_id": "anduril", "display_name": "Anduril Industries Inc.", "ticker": None, "sector_type": "cybersecurity", "sec_cik": None, "headquarters": "Costa Mesa, CA", "usaspending_recipient_name": "ANDURIL INDUSTRIES"},
    {"company_id": "shield-ai", "display_name": "Shield AI Inc.", "ticker": None, "sector_type": "cybersecurity", "sec_cik": None, "headquarters": "San Diego, CA", "usaspending_recipient_name": "SHIELD AI"},
    {"company_id": "bigbear-ai", "display_name": "BigBear.ai Holdings Inc.", "ticker": "BBAI", "sector_type": "intelligence", "sec_cik": "0001836981", "headquarters": "Columbia, MD", "usaspending_recipient_name": "BIGBEAR.AI"},
    {"company_id": "spire-global", "display_name": "Spire Global Inc.", "ticker": "SPIR", "sector_type": "intelligence", "sec_cik": "0001815317", "headquarters": "Vienna, VA", "usaspending_recipient_name": "SPIRE GLOBAL"},

    # ── Munitions / Weapons ──
    {"company_id": "general-atomics", "display_name": "General Atomics", "ticker": None, "sector_type": "munitions", "sec_cik": None, "headquarters": "San Diego, CA", "usaspending_recipient_name": "GENERAL ATOMICS"},
    {"company_id": "olin-corp", "display_name": "Olin Corporation", "ticker": "OLN", "sector_type": "munitions", "sec_cik": "0000074303", "headquarters": "Clayton, MO", "usaspending_recipient_name": "OLIN CORPORATION"},
    {"company_id": "vista-outdoor", "display_name": "Vista Outdoor Inc.", "ticker": "VSTO", "sector_type": "munitions", "sec_cik": "0001616318", "headquarters": "Anoka, MN", "usaspending_recipient_name": "VISTA OUTDOOR"},
    {"company_id": "nammo", "display_name": "Nammo AS", "ticker": None, "sector_type": "munitions", "sec_cik": None, "headquarters": "Raufoss, Norway", "usaspending_recipient_name": "NAMMO"},
    {"company_id": "orbital-atk", "display_name": "Northrop Grumman Innovation Systems", "ticker": None, "sector_type": "munitions", "sec_cik": None, "headquarters": "Chandler, AZ", "usaspending_recipient_name": "NORTHROP GRUMMAN INNOVATION SYSTEMS"},

    # ── Shipbuilding ──
    {"company_id": "austal-usa", "display_name": "Austal USA LLC", "ticker": None, "sector_type": "shipbuilding", "sec_cik": None, "headquarters": "Mobile, AL", "usaspending_recipient_name": "AUSTAL USA"},
    {"company_id": "philly-shipyard", "display_name": "Philly Shipyard ASA", "ticker": None, "sector_type": "shipbuilding", "sec_cik": None, "headquarters": "Philadelphia, PA", "usaspending_recipient_name": "PHILLY SHIPYARD"},
    {"company_id": "bollinger-shipyards", "display_name": "Bollinger Shipyards LLC", "ticker": None, "sector_type": "shipbuilding", "sec_cik": None, "headquarters": "Lockport, LA", "usaspending_recipient_name": "BOLLINGER SHIPYARDS"},

    # ── Aerospace Defense ──
    {"company_id": "kratos", "display_name": "Kratos Defense & Security Solutions", "ticker": "KTOS", "sector_type": "aerospace_defense", "sec_cik": "0001069974", "headquarters": "San Diego, CA", "usaspending_recipient_name": "KRATOS DEFENSE"},
    {"company_id": "mercury-systems", "display_name": "Mercury Systems Inc.", "ticker": "MRCY", "sector_type": "aerospace_defense", "sec_cik": "0000867840", "headquarters": "Andover, MA", "usaspending_recipient_name": "MERCURY SYSTEMS"},
    {"company_id": "curtiss-wright", "display_name": "Curtiss-Wright Corporation", "ticker": "CW", "sector_type": "aerospace_defense", "sec_cik": "0000026535", "headquarters": "Davidson, NC", "usaspending_recipient_name": "CURTISS-WRIGHT"},
    {"company_id": "heico", "display_name": "HEICO Corporation", "ticker": "HEI", "sector_type": "aerospace_defense", "sec_cik": "0000046619", "headquarters": "Hollywood, FL", "usaspending_recipient_name": "HEICO CORPORATION"},
    {"company_id": "howmet-aerospace", "display_name": "Howmet Aerospace Inc.", "ticker": "HWM", "sector_type": "aerospace_defense", "sec_cik": "0000004281", "headquarters": "Pittsburgh, PA", "usaspending_recipient_name": "HOWMET AEROSPACE"},
    {"company_id": "transdigm", "display_name": "TransDigm Group Inc.", "ticker": "TDG", "sector_type": "aerospace_defense", "sec_cik": "0001260221", "headquarters": "Cleveland, OH", "usaspending_recipient_name": "TRANSDIGM"},
    {"company_id": "woodward", "display_name": "Woodward Inc.", "ticker": "WWD", "sector_type": "aerospace_defense", "sec_cik": "0000880984", "headquarters": "Fort Collins, CO", "usaspending_recipient_name": "WOODWARD"},
    {"company_id": "spirit-aerosystems", "display_name": "Spirit AeroSystems Holdings", "ticker": "SPR", "sector_type": "aerospace_defense", "sec_cik": "0001364885", "headquarters": "Wichita, KS", "usaspending_recipient_name": "SPIRIT AEROSYSTEMS"},
    {"company_id": "aerojet-rocketdyne", "display_name": "Aerojet Rocketdyne Holdings", "ticker": None, "sector_type": "aerospace_defense", "sec_cik": "0000040888", "headquarters": "El Segundo, CA", "usaspending_recipient_name": "AEROJET ROCKETDYNE"},
    {"company_id": "triumph-group", "display_name": "Triumph Group Inc.", "ticker": "TGI", "sector_type": "aerospace_defense", "sec_cik": "0001021162", "headquarters": "Radnor, PA", "usaspending_recipient_name": "TRIUMPH GROUP"},
    {"company_id": "ducommun", "display_name": "Ducommun Incorporated", "ticker": "DCO", "sector_type": "aerospace_defense", "sec_cik": "0000030305", "headquarters": "Santa Ana, CA", "usaspending_recipient_name": "DUCOMMUN"},

    # ── Logistics / Defense IT ──
    {"company_id": "dxc-technology", "display_name": "DXC Technology Company", "ticker": "DXC", "sector_type": "logistics_defense", "sec_cik": "0001688568", "headquarters": "Ashburn, VA", "usaspending_recipient_name": "DXC TECHNOLOGY"},
    {"company_id": "accenture-federal", "display_name": "Accenture Federal Services LLC", "ticker": None, "sector_type": "logistics_defense", "sec_cik": None, "headquarters": "Arlington, VA", "usaspending_recipient_name": "ACCENTURE FEDERAL SERVICES"},
    {"company_id": "ibm-federal", "display_name": "IBM Corporation", "ticker": "IBM", "sector_type": "logistics_defense", "sec_cik": "0000051143", "headquarters": "Armonk, NY", "usaspending_recipient_name": "IBM"},
    {"company_id": "peraton", "display_name": "Peraton Inc.", "ticker": None, "sector_type": "logistics_defense", "sec_cik": None, "headquarters": "Herndon, VA", "usaspending_recipient_name": "PERATON"},
    {"company_id": "serco-na", "display_name": "Serco Inc.", "ticker": None, "sector_type": "logistics_defense", "sec_cik": None, "headquarters": "Herndon, VA", "usaspending_recipient_name": "SERCO"},
    {"company_id": "fluor-corp", "display_name": "Fluor Corporation", "ticker": "FLR", "sector_type": "logistics_defense", "sec_cik": "0001124198", "headquarters": "Irving, TX", "usaspending_recipient_name": "FLUOR CORPORATION"},
    {"company_id": "jacobs-engineering", "display_name": "Jacobs Solutions Inc.", "ticker": "J", "sector_type": "logistics_defense", "sec_cik": "0000049826", "headquarters": "Dallas, TX", "usaspending_recipient_name": "JACOBS"},
    {"company_id": "cognosante", "display_name": "Cognosante LLC", "ticker": None, "sector_type": "logistics_defense", "sec_cik": None, "headquarters": "Falls Church, VA", "usaspending_recipient_name": "COGNOSANTE"},

    # ── Missiles / Space Defense ──
    {"company_id": "rocket-lab", "display_name": "Rocket Lab USA Inc.", "ticker": "RKLB", "sector_type": "aerospace_defense", "sec_cik": "0001819994", "headquarters": "Long Beach, CA", "usaspending_recipient_name": "ROCKET LAB"},
    {"company_id": "aerovironment", "display_name": "AeroVironment Inc.", "ticker": "AVAV", "sector_type": "aerospace_defense", "sec_cik": "0000091142", "headquarters": "Arlington, VA", "usaspending_recipient_name": "AEROVIRONMENT"},
    {"company_id": "joby-aviation", "display_name": "Joby Aviation Inc.", "ticker": "JOBY", "sector_type": "aerospace_defense", "sec_cik": "0001819848", "headquarters": "Santa Cruz, CA", "usaspending_recipient_name": "JOBY AVIATION"},
    {"company_id": "v2x-defense", "display_name": "Saab Inc.", "ticker": None, "sector_type": "defense_sub", "sec_cik": None, "headquarters": "East Syracuse, NY", "usaspending_recipient_name": "SAAB INC"},
    {"company_id": "elbit-america", "display_name": "Elbit Systems of America LLC", "ticker": None, "sector_type": "defense_sub", "sec_cik": None, "headquarters": "Fort Worth, TX", "usaspending_recipient_name": "ELBIT SYSTEMS OF AMERICA"},
    {"company_id": "rafael-usa", "display_name": "RAFAEL Advanced Defense Systems", "ticker": None, "sector_type": "defense_sub", "sec_cik": None, "headquarters": "New York, NY", "usaspending_recipient_name": "RAFAEL ADVANCED DEFENSE SYSTEMS"},
]


# ============================================================================
# SEED FUNCTIONS
# ============================================================================

def seed_finance(db, dry_run=False):
    """Seed finance tracked institutions."""
    added, skipped = 0, 0
    for data in FINANCE_INSTITUTIONS:
        iid = data["institution_id"]
        existing = db.query(TrackedInstitution).filter_by(institution_id=iid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedInstitution(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Finance: {added} added, {skipped} already existed (total list: {len(FINANCE_INSTITUTIONS)})")
    return added


def seed_health(db, dry_run=False):
    """Seed health tracked companies."""
    added, skipped = 0, 0
    for data in HEALTH_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Health: {added} added, {skipped} already existed (total list: {len(HEALTH_COMPANIES)})")
    return added


def seed_tech(db, dry_run=False):
    """Seed tech tracked companies."""
    added, skipped = 0, 0
    for data in TECH_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedTechCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedTechCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Tech: {added} added, {skipped} already existed (total list: {len(TECH_COMPANIES)})")
    return added


def seed_energy(db, dry_run=False):
    """Seed energy tracked companies."""
    added, skipped = 0, 0
    for data in ENERGY_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedEnergyCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedEnergyCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Energy: {added} added, {skipped} already existed (total list: {len(ENERGY_COMPANIES)})")
    return added


def seed_transportation(db, dry_run=False):
    """Seed transportation tracked companies."""
    added, skipped = 0, 0
    for data in TRANSPORTATION_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedTransportationCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedTransportationCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Transportation: {added} added, {skipped} already existed (total list: {len(TRANSPORTATION_COMPANIES)})")
    return added


def seed_defense(db, dry_run=False):
    """Seed defense tracked companies."""
    added, skipped = 0, 0
    for data in DEFENSE_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedDefenseCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedDefenseCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Defense: {added} added, {skipped} already existed (total list: {len(DEFENSE_COMPANIES)})")
    return added


def main():
    parser = argparse.ArgumentParser(description="Seed tracked companies across all sectors")
    parser.add_argument("--sector", type=str, choices=["finance", "health", "tech", "energy", "transportation", "defense"],
                        help="Seed only this sector (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be added without writing to DB")
    args = parser.parse_args()

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        mode = "DRY RUN" if args.dry_run else "LIVE"
        print(f"\n{'='*60}")
        print(f"  Seed Tracked Companies ({mode})")
        print(f"{'='*60}\n")

        total_added = 0
        if args.sector is None or args.sector == "finance":
            total_added += seed_finance(db, args.dry_run)
        if args.sector is None or args.sector == "health":
            total_added += seed_health(db, args.dry_run)
        if args.sector is None or args.sector == "tech":
            total_added += seed_tech(db, args.dry_run)
        if args.sector is None or args.sector == "energy":
            total_added += seed_energy(db, args.dry_run)
        if args.sector is None or args.sector == "transportation":
            total_added += seed_transportation(db, args.dry_run)
        if args.sector is None or args.sector == "defense":
            total_added += seed_defense(db, args.dry_run)

        print(f"\n{'='*60}")
        print(f"  Total new entries: {total_added}")
        print(f"{'='*60}")

        # Print grand totals from DB
        if not args.dry_run:
            print("\nCurrent DB totals:")
            print(f"  Finance institutions: {db.query(TrackedInstitution).count()}")
            print(f"  Health companies:     {db.query(TrackedCompany).count()}")
            print(f"  Tech companies:       {db.query(TrackedTechCompany).count()}")
            print(f"  Energy companies:     {db.query(TrackedEnergyCompany).count()}")
            print(f"  Transportation:       {db.query(TrackedTransportationCompany).count()}")
            print(f"  Defense:              {db.query(TrackedDefenseCompany).count()}")
            print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
