"""
Smoke Test: Bulk Member Load
Validates that the TrackedMember system works end-to-end.

Tests:
1. Bulk load high_impact_50 preset
2. List members
3. Verify count (~50)
4. Check for duplicates
5. Verify database constraints (UNIQUE person_id, bioguide_id)
"""
import sys
from models.database import SessionLocal, TrackedMember, engine, Base


def clear_tracked_members():
    """Clear all tracked members (for testing only)."""
    db = SessionLocal()
    try:
        count = db.query(TrackedMember).count()
        if count > 0:
            db.query(TrackedMember).delete()
            db.commit()
            print(f"✅ Cleared {count} tracked members")
        else:
            print("✅ No tracked members to clear")
    finally:
        db.close()


def test_bulk_load():
    """Test bulk loading the high_impact_50 preset."""
    print("\n" + "=" * 70)
    print("TEST 1: Bulk Load high_impact_50")
    print("=" * 70)
    
    import subprocess
    result = subprocess.run(
        ["python", "manage_members.py", "bulk-load", "--preset", "high_impact_50"],
        capture_output=True,
        text=True
    )
    
    print(result.stdout)
    if result.returncode != 0:
        print("❌ Bulk load failed")
        print(result.stderr)
        return False
    
    print("✅ Bulk load completed")
    return True


def test_count():
    """Test that we have ~50 members loaded."""
    print("\n" + "=" * 70)
    print("TEST 2: Count Verification")
    print("=" * 70)
    
    db = SessionLocal()
    try:
        count = db.query(TrackedMember).count()
        active_count = db.query(TrackedMember).filter(TrackedMember.is_active == 1).count()
        
        print(f"Total tracked members: {count}")
        print(f"Active members: {active_count}")
        
        if count >= 45 and count <= 55:
            print(f"✅ Count is in expected range (45-55)")
            return True
        else:
            print(f"❌ Count is outside expected range (got {count}, expected ~50)")
            return False
    finally:
        db.close()


def test_no_duplicates():
    """Test that there are no duplicate person_ids or bioguide_ids."""
    print("\n" + "=" * 70)
    print("TEST 3: Duplicate Check")
    print("=" * 70)
    
    db = SessionLocal()
    try:
        # Check for duplicate person_ids
        total_count = db.query(TrackedMember).count()
        unique_person_ids = db.query(TrackedMember.person_id).distinct().count()
        unique_bioguides = db.query(TrackedMember.bioguide_id).distinct().count()
        
        print(f"Total members: {total_count}")
        print(f"Unique person_ids: {unique_person_ids}")
        print(f"Unique bioguide_ids: {unique_bioguides}")
        
        if total_count == unique_person_ids == unique_bioguides:
            print("✅ No duplicates found")
            return True
        else:
            print("❌ Duplicates detected!")
            return False
    finally:
        db.close()


def test_sample_members():
    """Test that some key members are present."""
    print("\n" + "=" * 70)
    print("TEST 4: Sample Member Check")
    print("=" * 70)
    
    db = SessionLocal()
    try:
        key_members = ["aoc", "john_thune", "chuck_schumer", "mike_johnson", "hakeem_jeffries"]
        
        for person_id in key_members:
            member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
            if member:
                print(f"✅ Found: {member.display_name} ({person_id})")
            else:
                print(f"❌ Missing: {person_id}")
                return False
        
        print("✅ All key members present")
        return True
    finally:
        db.close()


def test_list_command():
    """Test the list command."""
    print("\n" + "=" * 70)
    print("TEST 5: List Command")
    print("=" * 70)
    
    import subprocess
    result = subprocess.run(
        ["python", "manage_members.py", "list"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("❌ List command failed")
        print(result.stderr)
        return False
    
    # Just check that output contains expected headers
    if "TRACKED MEMBERS" in result.stdout and "Total:" in result.stdout:
        print("✅ List command works")
        print("\nSample output (first 10 lines):")
        print("\n".join(result.stdout.split("\n")[:10]))
        return True
    else:
        print("❌ List command output unexpected")
        return False


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("TRACKED MEMBER SYSTEM SMOKE TEST")
    print("=" * 70)
    print("\n⚠️  This test will CLEAR all tracked members and reload them.")
    print("    Press Ctrl+C to cancel, or Enter to continue...")
    input()
    
    # Ensure TrackedMember table exists
    Base.metadata.create_all(bind=engine)
    
    # Clear existing members
    clear_tracked_members()
    
    # Run tests
    tests = [
        ("Bulk Load", test_bulk_load),
        ("Count Verification", test_count),
        ("No Duplicates", test_no_duplicates),
        ("Sample Members", test_sample_members),
        ("List Command", test_list_command),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_fn in tests:
        try:
            if test_fn():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"\n❌ TEST FAILED WITH EXCEPTION: {e}")
            failed += 1
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print("=" * 70)
    
    if failed == 0:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print("\n⚠️  SOME TESTS FAILED")
        sys.exit(1)
