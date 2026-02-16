"""
Member Validation Script
Verify tracked members against Congress.gov API.

Checks:
- Bioguide ID resolves to a valid member
- Name matches (within reason)
- Member status (current vs historical)

Usage:
  python validate_members.py
  python validate_members.py --person-id aoc
"""
import argparse
import time
from models.database import SessionLocal, TrackedMember
from connectors.congress import robust_get, HEADERS


def validate_member(member: TrackedMember, verbose=True):
    """
    Validate a single member against Congress.gov API.
    
    Returns:
        dict: {
            "valid": bool,
            "api_name": str,
            "status": str,
            "error": str | None
        }
    """
    bioguide = member.bioguide_id
    
    # Hit member endpoint
    url = f"https://api.congress.gov/v3/member/{bioguide}"
    
    try:
        response = robust_get(url, headers=HEADERS)
        
        if response.status_code != 200:
            return {
                "valid": False,
                "api_name": None,
                "status": "NOT_FOUND",
                "error": f"HTTP {response.status_code}"
            }
        
        data = response.json()
        member_data = data.get("member", {})
        
        # Extract name
        direct_order_name = member_data.get("directOrderName", "")
        official_name = member_data.get("officialWebsiteUrl", "")
        
        # Determine status (current vs historical)
        # Note: Congress API doesn't have explicit "current" flag in some endpoints
        # We'll check if they have a current term
        terms = member_data.get("terms", {}).get("item", [])
        has_current_term = False
        latest_term = None
        
        if terms:
            # Sort by start date descending
            sorted_terms = sorted(terms, key=lambda t: t.get("startYear", 0), reverse=True)
            latest_term = sorted_terms[0]
            
            # Check if latest term is recent (within last 3 years)
            latest_start = latest_term.get("startYear", 0)
            current_year = 2025
            if current_year - latest_start <= 3:
                has_current_term = True
        
        status = "CURRENT" if has_current_term else "HISTORICAL"
        
        return {
            "valid": True,
            "api_name": direct_order_name,
            "status": status,
            "latest_chamber": latest_term.get("chamber", "").lower() if latest_term else None,
            "error": None
        }
        
    except Exception as e:
        return {
            "valid": False,
            "api_name": None,
            "status": "ERROR",
            "error": str(e)
        }


def validate_all_members():
    """Validate all tracked members."""
    db = SessionLocal()
    try:
        members = db.query(TrackedMember).order_by(TrackedMember.display_name).all()
        
        if not members:
            print("No tracked members found.")
            return
        
        print("=" * 100)
        print("MEMBER VALIDATION")
        print("=" * 100)
        print(f"Total members: {len(members)}")
        print()
        
        valid_count = 0
        invalid_count = 0
        current_count = 0
        historical_count = 0
        chamber_mismatch_count = 0
        
        for i, member in enumerate(members, 1):
            print(f"[{i}/{len(members)}] Validating: {member.display_name} ({member.bioguide_id})... ", end="")
            
            result = validate_member(member)
            time.sleep(0.4)  # Rate limiting
            
            if result["valid"]:
                valid_count += 1
                
                if result["status"] == "CURRENT":
                    current_count += 1
                    status_icon = "✅"
                else:
                    historical_count += 1
                    status_icon = "⚠️ "
                
                # Check chamber mismatch
                chamber_match = True
                if result["latest_chamber"] and result["latest_chamber"] != member.chamber:
                    chamber_match = False
                    chamber_mismatch_count += 1
                
                chamber_info = ""
                if not chamber_match:
                    chamber_info = f" [CHAMBER MISMATCH: DB={member.chamber}, API={result['latest_chamber']}]"
                
                print(f"{status_icon} {result['status']}{chamber_info}")
                
                if result["api_name"] and result["api_name"].lower() not in member.display_name.lower():
                    print(f"    ⚠️  Name mismatch: DB='{member.display_name}', API='{result['api_name']}'")
            else:
                invalid_count += 1
                print(f"❌ {result['status']}: {result['error']}")
        
        print()
        print("=" * 100)
        print("SUMMARY")
        print("=" * 100)
        print(f"  ✅ Valid: {valid_count}")
        print(f"  ❌ Invalid: {invalid_count}")
        print(f"  📊 Current: {current_count}")
        print(f"  📜 Historical: {historical_count}")
        if chamber_mismatch_count > 0:
            print(f"  ⚠️  Chamber mismatches: {chamber_mismatch_count}")
        print("=" * 100)
        
    finally:
        db.close()


def validate_single_member(person_id):
    """Validate a single member by person_id."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        
        if not member:
            print(f"❌ Member not found: {person_id}")
            return
        
        print("=" * 70)
        print("MEMBER VALIDATION")
        print("=" * 70)
        print(f"Person ID: {member.person_id}")
        print(f"Bioguide ID: {member.bioguide_id}")
        print(f"Display Name: {member.display_name}")
        print(f"Chamber: {member.chamber}")
        print(f"State: {member.state}")
        print(f"Party: {member.party}")
        print(f"Active: {'Yes' if member.is_active else 'No'}")
        print()
        print("Validating against Congress.gov API...")
        
        result = validate_member(member)
        
        print()
        if result["valid"]:
            print(f"✅ Status: {result['status']}")
            print(f"   API Name: {result['api_name']}")
            if result["latest_chamber"]:
                print(f"   Latest Chamber: {result['latest_chamber']}")
                if result["latest_chamber"] != member.chamber:
                    print(f"   ⚠️  CHAMBER MISMATCH (DB: {member.chamber})")
        else:
            print(f"❌ Status: {result['status']}")
            print(f"   Error: {result['error']}")
        
        print("=" * 70)
        
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate tracked members")
    parser.add_argument("--person-id", help="Validate single member by person_id")
    
    args = parser.parse_args()
    
    if args.person_id:
        validate_single_member(args.person_id)
    else:
        validate_all_members()
