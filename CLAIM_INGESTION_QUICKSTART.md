# Claim Ingestion System - Quick Start Guide (MVP v1)

## Overview

The Claim Ingestion System extracts political claims from official sources (congressional websites) and stores them for accountability tracking. This is MVP v1 with deterministic extraction, strong deduplication, and freshness-first design.

## Prerequisites

1. Database tables must exist (run migrations)
2. Tracked members must be loaded
3. Claim sources must be configured per member
4. Python dependencies: `requests`, `beautifulsoup4`

## Step-by-Step Setup

### 1. Update Database Schema

The new schema adds:
- `TrackedMember.claim_sources_json` - JSON list of source URLs
- `Claim.claim_hash` - SHA256 hash for deduplication (unique constraint)

Run migration:

```powershell
python -c "from models.database import Base, engine; Base.metadata.create_all(bind=engine); print('Tables updated')"
```

### 2. Verify Tracked Members

Check which members are active:

```powershell
python manage_members.py list
```

You should see 51 tracked members. If not, load the preset:

```powershell
python manage_members.py bulk-load --preset high_impact_50
```

### 3. Configure Claim Sources (Critical Step)

**IMPORTANT**: The system will NOT scrape unless sources are explicitly configured. This ensures legal compliance and accuracy.

#### View Current Sources

```powershell
python manage_members.py show-sources --all
```

#### Set Sources for a Member

Example for AOC:

```powershell
python manage_members.py set-sources --person-id aoc --json-file data\aoc_sources_example.json
```

Example for Bernie Sanders:

```powershell
python manage_members.py set-sources --person-id bernie_sanders --json-file data\sanders_sources_example.json
```

#### Source JSON Format

Each source file is a JSON array of source objects:

```json
[
  {
    "url": "https://member-site.gov/press-releases",
    "type": "press"
  },
  {
    "url": "https://member-site.gov/statements",
    "type": "statement"
  }
]
```

**Where to find official sources**:
- House members: `https://[lastname].house.gov/media/press-releases`
- Senate members: `https://www.senate.gov/[lastname]/`
- Look for: /press-releases, /news, /statements, /remarks

### 4. Run Claim Ingestion

#### Test with Single Member (Dry Run)

```powershell
python jobs\ingest_claims.py --person-id aoc --since-days 30 --dry-run
```

This shows what WOULD be extracted without inserting data.

#### Ingest for Single Member

```powershell
python jobs\ingest_claims.py --person-id aoc --since-days 30 --limit-pages 20
```

#### Ingest for All Members

```powershell
python jobs\ingest_claims.py --all --since-days 30 --limit-pages 50 --rate-limit 0.5
```

#### With Time Limit (Recommended)

```powershell
python jobs\ingest_claims.py --all --since-days 30 --limit-pages 50 --rate-limit 0.4 --max-seconds 600
```

This runs for max 10 minutes then stops gracefully.

### 5. Verify Results

```powershell
python scripts\verify_claims.py --all
```

Shows:
- Total claims ingested
- Per-member breakdown
- Newest/oldest claim dates
- Deduplication verification

### 6. Run Tests

#### Test Extraction Logic

```powershell
python test_claim_extraction.py
```

Validates:
- Trigger phrase detection
- Boilerplate filtering
- Fundraising exclusion
- Length constraints

#### Test Deduplication

```powershell
python test_claim_hash_dedupe.py
```

Validates:
- Hash computation consistency
- Database unique constraint
- Duplicate rejection

### 7. Compute Evaluations (Match Claims to Bills)

After ingesting claims, compute matches:

```powershell
python jobs\recompute_evaluations.py --all --limit 500
```

This runs the matching pipeline to evaluate each claim against legislative data.

### 8. Test API Endpoints

Start the API server:

```powershell
python main.py
```

Then query (in another terminal):

```powershell
# List claims for a member
Invoke-RestMethod "http://127.0.0.1:8000/claims?person_id=aoc&limit=10" | ConvertTo-Json -Depth 5

# Get specific claim
Invoke-RestMethod "http://127.0.0.1:8000/claims/1" | ConvertTo-Json -Depth 5

# Get claim evaluation (after recompute)
Invoke-RestMethod "http://127.0.0.1:8000/claims/1/evaluation" | ConvertTo-Json -Depth 10
```

## CLI Reference

### jobs/ingest_claims.py

```
--person-id <id>        Ingest for specific member
--all                   Ingest for all active members
--since-days <int>      Look back N days (default: 30)
--force-old             Required if since-days > 180 (safety gate)
--limit-pages <int>     Max articles per source (default: 50)
--rate-limit <float>    Delay between requests (default: 0.4s)
--max-seconds <int>     Graceful stop after N seconds
--dry-run               Print what would be done, insert nothing
```

### scripts/verify_claims.py

```
--person-id <id>        Show claims for specific member
--all                   Show all claims
```

### manage_members.py

```
set-sources --person-id <id> --json-file <path>    Set claim sources
show-sources --all                                  Show all sources
show-sources --person-id <id>                       Show sources for one member
```

## Extraction Rules (What Gets Captured)

### Trigger Phrases

Claims are identified by these patterns (case-insensitive):
- "I introduced", "I sponsored", "I cosponsored"
- "I voted", "I opposed", "I support"
- "my bill", "this legislation"
- "we passed", "we secured"
- "I fought", "I am fighting"
- "I called on", "I demand", "I urge"

### Filters (What Gets Excluded)

**Fundraising language**:
- "donate", "chip in", "contribute", "fundraiser", "ActBlue"

**Boilerplate**:
- "read more", "click here", "share this", "follow us"

**Length constraints**:
- Minimum 10 words
- Maximum 60 words

### Deduplication

Each claim gets a SHA256 hash of:
- `person_id + normalized_text + source_url`

Normalization = lowercase, strip punctuation, collapse whitespace.

Same claim from different pages = different hash (intentional).
Same claim text on same page = same hash (prevents duplicates).

## Freshness Gates

- Default: `--since-days 30` (last month)
- Hard block: Articles older than 180 days require `--force-old` flag
- Prevents accidental processing of stale content

## Expected Volume

For 50+ members with 2 sources each:
- **Pages fetched per run**: ~100-200 index pages
- **Articles visited**: ~2,500-5,000 (with --limit-pages 50)
- **Claims extracted**: ~5,000-15,000 initial load
- **Claims inserted**: ~4,000-12,000 (after dedupe)
- **Database size**: Negligible (<50MB)

Subsequent runs (weekly):
- **New claims per run**: ~500-1,500 (30-day window)

## Troubleshooting

### No Claims Extracted

**Symptom**: `python scripts\verify_claims.py --all` shows 0 claims.

**Causes**:
1. **No sources configured**: Run `python manage_members.py show-sources --all`
   - If empty, set sources with `set-sources` command
2. **Wrong URL**: Check that source URLs are valid official pages
3. **Stale content**: Try `--since-days 90` for broader window
4. **Extraction mismatch**: Pages may not match trigger patterns

**Debug**:
```powershell
python jobs\ingest_claims.py --person-id aoc --since-days 90 --limit-pages 5 --dry-run
```

Check console output for:
- "No claim sources configured" → Set sources
- "No claim sentences found" → Page may not match patterns
- "Skipping (too old)" → Increase --since-days

### Duplicate Claims Appearing

**Symptom**: Same claim appears multiple times.

**Check**:
```powershell
python scripts\verify_claims.py --all
```

Look for "WARNING: duplicate hashes found".

**Cause**: Unique constraint may not be working. Re-create tables:
```powershell
python -c "from models.database import Base, engine, Claim; Claim.__table__.drop(engine); Base.metadata.create_all(bind=engine)"
```

### Rate Limiting / Network Errors

**Symptom**: "Failed to fetch" errors or 429 responses.

**Solution**:
- Increase `--rate-limit` (try 1.0 or 2.0 seconds)
- Reduce `--limit-pages` (try 20 instead of 50)
- Add `--max-seconds` to prevent long runs

### Database Lock Errors

**Symptom**: "database is locked" errors (SQLite).

**Solution**:
- Close any other processes accessing the database
- Use `--limit-pages` to keep transactions smaller
- Consider migration to PostgreSQL for production

## Best Practices

### Initial Load (First Time)

1. **Start small**: Ingest 2-3 members first
   ```powershell
   python jobs\ingest_claims.py --person-id aoc --since-days 30
   python jobs\ingest_claims.py --person-id bernie_sanders --since-days 30
   ```

2. **Verify results**:
   ```powershell
   python scripts\verify_claims.py --all
   ```

3. **Compute evaluations**:
   ```powershell
   python jobs\recompute_evaluations.py --all --limit 100
   ```

4. **Test API**:
   ```powershell
   Invoke-RestMethod "http://127.0.0.1:8000/claims?person_id=aoc&limit=5"
   ```

5. **Scale to all members** (if results look good):
   ```powershell
   python jobs\ingest_claims.py --all --since-days 30 --max-seconds 900
   ```

### Ongoing Maintenance (Weekly)

Run weekly to capture new claims:

```powershell
python jobs\ingest_claims.py --all --since-days 7 --limit-pages 10 --rate-limit 0.5
```

Then recompute evaluations for new claims:

```powershell
python jobs\recompute_evaluations.py --dirty-only --limit 1000
```

### Expansion (Adding Members)

1. Add member to database (if not in preset):
   ```powershell
   python manage_members.py add --person-id new_member --bioguide X000000 --name "New Member" --chamber house
   ```

2. Create source JSON file:
   ```json
   [{"url": "https://...", "type": "press"}]
   ```

3. Set sources:
   ```powershell
   python manage_members.py set-sources --person-id new_member --json-file data\new_member_sources.json
   ```

4. Ingest:
   ```powershell
   python jobs\ingest_claims.py --person-id new_member --since-days 30
   ```

## Architecture Notes

### Why Deterministic Extraction?

- **Predictable**: Same input → same output
- **Auditable**: Rules are transparent
- **Fast**: No ML inference overhead
- **Improvable**: Easy to refine trigger patterns

### Why Hash-Based Dedupe?

- **Fast**: O(1) lookup via unique constraint
- **Reliable**: SHA256 collision probability negligible
- **Transparent**: Hash formula is simple and documented

### Why Separate Source Configuration?

- **Legal safety**: Only scrape explicitly approved official sites
- **Quality control**: Manually vet each source
- **Scalability**: Easy to add/remove sources per member
- **Audit trail**: Clear provenance for each claim

## Next Steps (Post-MVP)

1. **Improve extraction**: Add more trigger patterns based on real data
2. **Add intent classification**: Detect "sponsored" vs "voted" vs "supported"
3. **Category inference**: Map claims to policy areas
4. **Congressional Record**: Ingest floor speeches
5. **Social media**: Add official Twitter/X feeds (API permitting)
6. **Dashboard**: Build UI for claim browsing and evaluation viewing

## Support

For issues or questions:
1. Check troubleshooting section above
2. Run tests to validate setup
3. Use `--dry-run` to debug without inserting data
4. Check logs for specific error messages

## Summary

**What you should have after setup**:
- Database schema updated
- 51 tracked members loaded
- 2-10 claim sources configured (start small!)
- 100+ claims ingested from test members
- Tests passing
- API returning claim data

**Key commands to remember**:
```powershell
# Set sources
python manage_members.py set-sources --person-id aoc --json-file data\aoc_sources_example.json

# Ingest claims
python jobs\ingest_claims.py --all --since-days 30 --limit-pages 50

# Verify
python scripts\verify_claims.py --all

# Compute evaluations
python jobs\recompute_evaluations.py --all

# Test
python test_claim_extraction.py
python test_claim_hash_dedupe.py
```

You're ready to start capturing accountability data!
