"""
Test claim hash deduplication.
Ensures the unique constraint on claim_hash prevents duplicate claims.
"""

import sys
import os
from datetime import date

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Claim
from jobs.ingest_claims import compute_claim_hash
from sqlalchemy.exc import IntegrityError


def test_hash_computation():
    """Test that hash is computed consistently."""
    
    person_id = "test_person"
    text = "I introduced the Climate Action Now Act."
    source_url = "https://example.com/press/climate-action"
    
    hash1 = compute_claim_hash(person_id, text, source_url)
    hash2 = compute_claim_hash(person_id, text, source_url)
    
    assert hash1 == hash2, "Hash should be deterministic"
    
    # Test normalization (same text with different case/punctuation)
    text_variant = "I INTRODUCED the Climate Action Now Act!!!"
    hash3 = compute_claim_hash(person_id, text_variant, source_url)
    
    assert hash1 == hash3, "Hash should normalize text (case/punctuation insensitive)"
    
    # Different source URL should produce different hash
    different_url = "https://example.com/press/different"
    hash4 = compute_claim_hash(person_id, text, different_url)
    
    assert hash1 != hash4, "Different source URL should produce different hash"
    
    print("[OK] Hash computation is consistent and normalized")


def test_database_deduplication():
    """Test that database prevents duplicate claims."""
    
    db = SessionLocal()
    
    try:
        # Clean up any existing test claims
        db.query(Claim).filter(Claim.person_id == "test_dedupe").delete()
        db.commit()
        
        # Create first claim
        person_id = "test_dedupe"
        text = "I voted for the Infrastructure Investment and Jobs Act."
        source_url = "https://example.com/press/infrastructure"
        claim_hash = compute_claim_hash(person_id, text, source_url)
        
        claim1 = Claim(
            person_id=person_id,
            text=text,
            claim_date=date.today(),
            claim_source_url=source_url,
            claim_hash=claim_hash,
            category='general',
        )
        
        db.add(claim1)
        db.commit()
        
        print(f"[OK] Inserted first claim (id={claim1.id})")
        
        # Try to insert duplicate (same hash)
        claim2 = Claim(
            person_id=person_id,
            text=text,  # Same text (will normalize to same hash)
            claim_date=date.today(),
            claim_source_url=source_url,
            claim_hash=claim_hash,
            category='general',
        )
        
        try:
            db.add(claim2)
            db.commit()
            
            # Should not reach here
            assert False, "Should have raised IntegrityError for duplicate hash"
            
        except IntegrityError:
            db.rollback()
            print("[OK] Duplicate claim rejected (IntegrityError raised)")
        
        # Verify only one claim exists
        count = db.query(Claim).filter(Claim.person_id == "test_dedupe").count()
        assert count == 1, f"Expected 1 claim, found {count}"
        
        print(f"[OK] Only 1 claim in database (deduplication working)")
        
        # Clean up
        db.query(Claim).filter(Claim.person_id == "test_dedupe").delete()
        db.commit()
        
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 70)
    print("CLAIM HASH DEDUPLICATION TESTS")
    print("=" * 70)
    print()
    
    test_hash_computation()
    test_database_deduplication()
    
    print()
    print("=" * 70)
    print("ALL TESTS PASSED")
    print("=" * 70)
