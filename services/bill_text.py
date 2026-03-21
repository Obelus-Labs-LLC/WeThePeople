"""
Bill Text Helper
Fetch and format bill text version links for evidence receipts.

Phase 3.2: "No bullshit" upgrade - link to actual legislative text.
"""

import os
import requests
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("CONGRESS_API_KEY")
BASE_URL = "https://api.congress.gov/v3"


# Text version codes and their meanings (for display)
TEXT_VERSION_NAMES = {
    "IH": "Introduced in House",
    "IS": "Introduced in Senate",
    "RH": "Reported in House",
    "RS": "Reported in Senate",
    "EH": "Engrossed in House",
    "ES": "Engrossed in Senate",
    "ENR": "Enrolled (final version sent to President)",
    "RDS": "Received in Senate",
    "RFS": "Referred in Senate",
    "PCS": "Placed on Calendar Senate",
    "CPS": "Considered and Passed Senate",
    "CPH": "Considered and Passed House",
    "EAH": "Engrossed Amendment House",
    "EAS": "Engrossed Amendment Senate",
}


def get_bill_text_versions(congress: int, bill_type: str, bill_number: int) -> List[Dict]:
    """
    Fetch available text versions for a bill.
    
    Args:
        congress: Congress number (118, 119, etc.)
        bill_type: Bill type (HR, S, HJRES, etc.)
        bill_number: Bill number
        
    Returns:
        List of text version dictionaries with type, name, date, URLs
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/text"
    params = {
        "api_key": API_KEY,
        "format": "json",
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            versions = data.get("textVersions", [])
            
            # Format text versions for display
            formatted = []
            for version in versions:
                version_code = version.get("type")
                version_name = TEXT_VERSION_NAMES.get(version_code, version_code)
                
                # Extract format URLs
                formats = {}
                for fmt in version.get("formats", []):
                    fmt_type = fmt.get("type")  # PDF, XML, HTML
                    fmt_url = fmt.get("url")
                    if fmt_type and fmt_url:
                        formats[fmt_type.lower()] = fmt_url
                
                formatted.append({
                    "code": version_code,
                    "name": version_name,
                    "date": version.get("date"),
                    "formats": formats,
                })
            
            return formatted
        
        # No text versions available
        return []
        
    except Exception as e:
        print(f"Error fetching text versions: {e}")
        return []


def get_congress_gov_text_url(congress: int, bill_type: str, bill_number: int, version_code: Optional[str] = None) -> str:
    """
    Construct congress.gov URL for bill text.
    
    Args:
        congress: Congress number
        bill_type: Bill type
        bill_number: Bill number
        version_code: Optional version code (ENR, IH, etc.)
        
    Returns:
        URL to bill text on congress.gov
    """
    base = f"https://www.congress.gov/bill/{congress}th-congress/{bill_type.lower()}-bill/{bill_number}/text"
    
    if version_code:
        return f"{base}?format=txt&r={version_code}"
    
    return base


def format_text_receipt(congress: int, bill_type: str, bill_number: int) -> Dict:
    """
    Build a complete text receipt with all available versions.
    
    Args:
        congress: Congress number
        bill_type: Bill type
        bill_number: Bill number
        
    Returns:
        Dictionary with text versions and congress.gov link
    """
    versions = get_bill_text_versions(congress, bill_type, bill_number)
    congress_gov_url = get_congress_gov_text_url(congress, bill_type, bill_number)
    
    return {
        "congress_gov_text_url": congress_gov_url,
        "text_versions": versions,
        "has_text": len(versions) > 0,
        "latest_version": versions[0] if versions else None,
    }


def search_bill_text_for_phrases(bill_text: str, phrases: List[str]) -> List[Dict]:
    """
    Mechanical phrase search in bill text (no interpretation).
    
    Args:
        bill_text: Full bill text
        phrases: List of phrases to search for
        
    Returns:
        List of matches with context snippets
    """
    if not bill_text or not phrases:
        return []
    
    matches = []
    text_lower = bill_text.lower()
    
    for phrase in phrases:
        phrase_lower = phrase.lower()
        index = 0
        
        while True:
            index = text_lower.find(phrase_lower, index)
            if index == -1:
                break
            
            # Extract context (100 chars before and after)
            start = max(0, index - 100)
            end = min(len(bill_text), index + len(phrase) + 100)
            snippet = bill_text[start:end]
            
            # Clean up snippet
            snippet = snippet.replace("\n", " ").strip()
            if start > 0:
                snippet = "..." + snippet
            if end < len(bill_text):
                snippet = snippet + "..."
            
            matches.append({
                "phrase": phrase,
                "position": index,
                "snippet": snippet,
            })
            
            # Move past this match
            index += len(phrase)
            
            # Limit matches per phrase
            if len([m for m in matches if m["phrase"] == phrase]) >= 3:
                break
    
    return matches


if __name__ == "__main__":
    # Test with a known bill
    print("Testing bill text helper...")
    
    # Example: HR 2670 (National Defense Authorization Act for Fiscal Year 2024)
    receipt = format_text_receipt(118, "HR", 2670)
    
    print(f"\nCongress.gov URL: {receipt['congress_gov_text_url']}")
    print(f"Has text: {receipt['has_text']}")
    print(f"\nAvailable versions ({len(receipt['text_versions'])}):")
    for v in receipt['text_versions']:
        print(f"  - {v['code']} ({v['name']}) - {v['date']}")
        print(f"    Formats: {', '.join(v['formats'].keys())}")
