import sqlite3
from datetime import datetime

conn = sqlite3.connect('wethepeople.db')
cursor = conn.cursor()

for person_id in ['chuck_schumer', 'ron_wyden']:
    print("=" * 80)
    print(f"{person_id.upper().replace('_', ' ')}")
    print("=" * 80)
    
    cursor.execute("""
        SELECT id, text, claim_source_url, claim_date, category, intent
        FROM claims
        WHERE person_id = ?
        ORDER BY claim_date DESC
        LIMIT 10
    """, (person_id,))
    
    claims = cursor.fetchall()
    print(f"\nTotal claims: {len(claims)}")
    print("\nNewest 10 claims:\n")
    
    for i, (claim_id, text, url, date, category, intent) in enumerate(claims, 1):
        # Truncate text to first 100 chars for readability
        text_preview = text[:100] + "..." if len(text) > 100 else text
        
        # Extract key indicators
        has_bill_number = any(marker in text.upper() for marker in ['H.R.', 'S.', 'H. R.', 'S. '])
        has_introduced = any(word in text.lower() for word in ['introduced', 'reintroduced', 'cosponsored'])
        has_funding = any(word in text.lower() for word in ['funding', 'grant', 'earmark', 'secured', 'announced', 'million', 'billion'])
        has_act = ' act' in text.lower() or ' act ' in text.lower()
        
        print(f"[{i}] Claim #{claim_id} ({date})")
        print(f"    Text: {text_preview}")
        print(f"    URL: {url}")
        print(f"    Signals: bill_num={has_bill_number}, introduced={has_introduced}, funding={has_funding}, act={has_act}")
        print()

conn.close()
