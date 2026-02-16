"""Manually add claim ingestion columns to database."""

from sqlalchemy import create_engine, text

engine = create_engine('sqlite:///./wethepeople.db')

with engine.connect() as conn:
    # Check if claim_hash column exists
    claims_cols = [row[1] for row in conn.execute(text('PRAGMA table_info(claims)'))]
    if 'claim_hash' not in claims_cols:
        conn.execute(text('ALTER TABLE claims ADD COLUMN claim_hash VARCHAR'))
        print('Added claim_hash column to claims table')
    else:
        print('claim_hash column already exists')
    
    # Check if index exists
    claims_indexes = [row[1] for row in conn.execute(text('PRAGMA index_list(claims)'))]
    if 'ix_claims_claim_hash' not in claims_indexes:
        conn.execute(text('CREATE UNIQUE INDEX ix_claims_claim_hash ON claims(claim_hash)'))
        print('Created unique index on claim_hash')
    else:
        print('ix_claims_claim_hash index already exists')
    
    # Check if claim_sources_json column exists
    members_cols = [row[1] for row in conn.execute(text('PRAGMA table_info(tracked_members)'))]
    if 'claim_sources_json' not in members_cols:
        conn.execute(text('ALTER TABLE tracked_members ADD COLUMN claim_sources_json TEXT'))
        print('Added claim_sources_json column to tracked_members table')
    else:
        print('claim_sources_json column already exists')
    
    conn.commit()

print('\nVerifying columns...')
with engine.connect() as conn:
    result = conn.execute(text('PRAGMA table_info(claims)'))
    claims_cols = [row[1] for row in result]
    print(f'Claims columns: {claims_cols}')
    
    result = conn.execute(text('PRAGMA table_info(tracked_members)'))
    members_cols = [row[1] for row in result]
    print(f'TrackedMembers columns: {members_cols}')

print('\nDone!')
