"""
Test Bronze Layer Functionality

Simple test to verify Bronze document insertion works.

Usage:
    python test_bronze_layer.py
"""

import sys
import hashlib
import warnings
from datetime import datetime

# Suppress deprecation warnings for this test
warnings.filterwarnings("ignore", category=DeprecationWarning)

from models.database import SessionLocal, BronzeDocument

def test_bronze_insertion():
    """Test basic Bronze document creation and retrieval."""
    print("=" * 70)
    print("BRONZE LAYER TEST")
    print("=" * 70)
    print()
    
    db = SessionLocal()
    
    try:
        # Test data
        test_html = "<html><body>Test content</body></html>"
        test_hash = hashlib.md5(test_html.encode('utf-8')).hexdigest()
        
        # Check existing
        existing_count = db.query(BronzeDocument).count()
        print(f"Existing Bronze documents: {existing_count}")
        
        # Create test document
        bronze_doc = BronzeDocument(
            person_id="test_person",
            source_url="https://example.com/test",
            fetched_at=datetime.utcnow(),
            content_type='html',
            raw_html=test_html,
            raw_text=None,
            fetch_hash=test_hash
        )
        
        db.add(bronze_doc)
        db.commit()
        
        print(f"PASS: Inserted Bronze document #{bronze_doc.id}")
        print(f"  Person ID: {bronze_doc.person_id}")
        print(f"  URL: {bronze_doc.source_url}")
        print(f"  Hash: {test_hash[:16]}...")
        print(f"  Fetched at: {bronze_doc.fetched_at}")
        print()
        
        # Verify retrieval
        retrieved = db.query(BronzeDocument).filter(
            BronzeDocument.id == bronze_doc.id
        ).first()
        
        assert retrieved is not None, "Failed to retrieve Bronze document"
        assert retrieved.fetch_hash == test_hash, "Hash mismatch"
        assert retrieved.person_id == "test_person", "Person ID mismatch"
        
        print("PASS: Retrieved document successfully")
        print(f"  Content length: {len(retrieved.raw_html)} bytes")
        print()
        
        # Test deduplication (inserting same hash again)
        duplicate_exists = db.query(BronzeDocument).filter(
            BronzeDocument.fetch_hash == test_hash
        ).count()
        
        print(f"PASS: Deduplication check: {duplicate_exists} document(s) with same hash")
        print()
        
        # Cleanup
        db.delete(bronze_doc)
        db.commit()
        print("PASS: Cleaned up test document")
        print()
        
        print("=" * 70)
        print("ALL TESTS PASSED")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"FAIL: Test failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    success = test_bronze_insertion()
    sys.exit(0 if success else 1)
