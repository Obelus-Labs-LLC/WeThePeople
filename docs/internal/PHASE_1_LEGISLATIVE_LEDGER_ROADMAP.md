# Phase 1: Perfect the Legislative Ledger

Date: 2026-02-05
Status: **READY TO START** ✅

## Objective

**Lock the Legislative Ledger as a production-grade truth engine before expanding to Oversight Actions.**

Legislation is the credibility anchor. Everything else inherits trust from it.

## What We've Proven So Far ✅

- Ingestion works (18 claims across 3 members)
- Dedupe works (hash-based, zero duplicates)
- Freshness works (claim_date extraction)
- Matching works conservatively (16.7% match rate, 0 false positives)
- False positives controlled (quality gates passing)
- Metrics are real (matchability diagnostic, not vibes)

## What We Haven't Done Yet ⚠️

- **Scale validation**: Only 3 members (need 8-10 to prove matcher stays conservative)
- **Bill number extraction**: Not detecting H.R./S. #### in claim text for hard linking
- **Vote verification**: Not checking actual vote records (only sponsorship/action data)
- **UI validation**: No human-readable interface to validate data model

---

## Step 1: Expand to 8-10 High-Signal Members

**Goal:** Prove matcher stays conservative as volume grows

### Target Member Profile
- **Bill-mention density:** 50%+ matchability predicted
- **Content patterns:**
  - Frequent bill number citations (H.R. ###, S. ###)
  - Act title mentions
  - Vote announcements
  - Named legislative packages
- **Source types:**
  - Legislation pages (not general press)
  - Bill introduction announcements
  - Vote statements
  - Committee hearing updates

### Recommended Candidates (7 new members)

#### Senate (4 members)
1. **Chuck Schumer** (Majority/Minority Leader)
   - Role: Leadership (controls floor votes)
   - Source: schumer.senate.gov/newsroom/press-releases
   - Predicted matchability: 40-50% (leadership vote announcements)
   - Why: Named packages, floor schedule, leadership bills

2. **Ron Wyden** (Finance Chair)
   - Role: Committee Chair (Ways & Means equivalent)
   - Source: wyden.senate.gov/news/legislation
   - Predicted matchability: 60%+ (dedicated legislation page)
   - Why: Frequent sponsor, policy-heavy, bill intro announcements

3. **Amy Klobuchar** (Rules Chair, frequent sponsor)
   - Role: Committee Chair + bipartisan legislator
   - Source: klobuchar.senate.gov/public/news-releases?type=legislation
   - Predicted matchability: 50-60% (legislation filter available)
   - Why: Bipartisan bills, tech policy, frequent introductions

4. **Cory Booker** (prolific sponsor)
   - Role: Judiciary Committee, frequent bill sponsor
   - Source: booker.senate.gov/news/press-releases (filter by legislation)
   - Predicted matchability: 50%+ (policy-focused, bill citations)
   - Why: Named bills (Baby Bonds, criminal justice reform)

#### House (3 members)
5. **Katie Porter** (Oversight Ranking Member)
   - Role: Committee leadership, detailed policy
   - Source: porter.house.gov/news (filter by legislation)
   - Predicted matchability: 60%+ (detailed bill explanations)
   - Why: Charts/data, bill citations, policy deep-dives

6. **Ro Khanna** (tech policy leader)
   - Role: Oversight Committee, tech/labor focus
   - Source: khanna.house.gov/media/press-releases (filter by bills)
   - Predicted matchability: 50%+ (tech legislation, named bills)
   - Why: Internet Bill of Rights, labor policy, frequent sponsor

7. **Pramila Jayapal** (Progressive Caucus Chair)
   - Role: Leadership, named package pusher
   - Source: jayapal.house.gov/media/press-releases
   - Predicted matchability: 50%+ (Medicare for All, named packages)
   - Why: Leadership on major bills, caucus coordination

### Controlled Expansion Strategy

**Week 1-2: Add 3 members** (Schumer, Wyden, Porter)
- High-confidence picks (leadership + dedicated legislation pages)
- Run full onboarding checklist for each
- Mandatory matchability check (target 50%+)
- Quality gate after each addition
- Monitor baseline metrics

**Week 3-4: Add 2 members** (Klobuchar, Khanna)
- Validate matcher handling diverse content styles
- Check for false positive drift
- Verify matchability trend stays >30% overall

**Week 5-6: Add 2 members** (Booker, Jayapal)
- Final validation at 10-member scale
- Check hash deduplication at ~60-80 claims
- Verify matcher performance doesn't degrade

### Success Metrics (Step 1)
- [ ] 8-10 members onboarded
- [ ] 60-100 total claims ingested
- [ ] Overall corpus matchability: 35-45%
- [ ] Match rate: 20-30% (expect increase as volume grows)
- [ ] False positive rate: 0% (CRITICAL)
- [ ] Quality gates: ALL PASSING after each addition
- [ ] Baseline snapshot: Stable metrics, no degradation

---

## Step 2: Add Bill Number Extraction

**Goal:** Hard-link claims to bills when explicit bill numbers mentioned

### Current Limitation
Matcher relies on:
- URL title matching ("defiance-act" → DEFIANCE Act)
- Act name overlap (text mentions "Infrastructure Act" → bill title match)
- Fuzzy scoring

**Missing:** Direct bill number detection in claim text

### Implementation Plan

#### 2.1 Enhance Claim Processing (Ingestion)
**File:** `services/claim_ingestion.py` or similar

```python
def extract_bill_references(claim_text: str) -> list:
    """Extract bill numbers from claim text.
    
    Patterns detected:
    - H.R. 3562, HR 3562, HR3562
    - S. 1123, S 1123, S1123
    - House Resolution 3562
    - Senate Bill 1123
    """
    patterns = [
        r'\bH\.?R\.?\s?\d{1,4}\b',           # H.R. 3562, HR3562
        r'\bS\.?\s?\d{1,4}\b',               # S. 1123, S1123
        r'\bHouse\s+(?:Resolution|Bill)\s+\d{1,4}\b',  # House Resolution 3562
        r'\bSenate\s+Bill\s+\d{1,4}\b'       # Senate Bill 1123
    ]
    
    references = []
    for pattern in patterns:
        matches = re.findall(pattern, claim_text, re.IGNORECASE)
        references.extend(matches)
    
    # Normalize to standard format: hr3562-119, s1123-119
    normalized = []
    for ref in references:
        # Parse and normalize...
        normalized.append(normalize_bill_id(ref))
    
    return normalized
```

**Database schema enhancement:**
```python
# Add to Claim model
class Claim(Base):
    # ... existing fields ...
    
    # NEW: Extracted bill references from claim text
    bill_references_json = Column(JSON, nullable=True)
    # Example: ["hr3562-119", "s1123-119"]
```

#### 2.2 Enhance Matching Logic
**File:** `services/matching.py`

```python
def match_claim_to_bills(claim: Claim, bills: list) -> list:
    """Match claim to bills with bill number boost.
    
    Scoring priority:
    1. Direct bill number match (HIGH CONFIDENCE) - score boost +30
    2. URL title match (MEDIUM CONFIDENCE) - current logic
    3. Act name overlap (LOWER CONFIDENCE) - current logic
    """
    
    matches = []
    
    # PRIORITY 1: Direct bill number matches
    if claim.bill_references_json:
        for bill_id in claim.bill_references_json:
            bill = find_bill_by_id(bill_id, bills)
            if bill:
                matches.append({
                    'bill': bill,
                    'score': 80,  # High confidence
                    'evidence': ['direct_bill_number_mention'],
                    'confidence': 'HIGH'
                })
    
    # PRIORITY 2: URL/Act name matching (existing logic)
    # ... existing matcher code ...
    
    return matches
```

#### 2.3 Update Evidence Types
**File:** `services/matching.py` - evidence tracking

```python
EVIDENCE_TYPES = {
    'direct_bill_number': 30,      # NEW: "H.R. 3562" in claim text
    'url_match': 20,               # Existing
    'title_overlap': 15,           # Existing
    'timing:retroactive_credit': 10,  # Existing
    'progress:passed_committee': 5,   # Existing
}
```

### Testing Strategy

#### Test Case 1: Direct Bill Number
```python
claim_text = "I'm proud to introduce H.R. 3562, the DEFIANCE Act, to combat deepfakes."
expected_bill_refs = ["hr3562-119"]
expected_match = True
expected_evidence = ['direct_bill_number_mention', 'title_overlap']
expected_score = 80+
```

#### Test Case 2: Multiple Bills
```python
claim_text = "Today I voted for H.R. 1234 and S. 5678 to protect consumers."
expected_bill_refs = ["hr1234-119", "s5678-119"]
expected_matches = 2  # If both bills in DB
```

#### Test Case 3: Ambiguous Format
```python
claim_text = "Senate Bill 1123 would strengthen ethics rules."
expected_bill_refs = ["s1123-119"]
expected_match = True
```

### Success Metrics (Step 2)
- [ ] Bill number extraction implemented
- [ ] Database schema updated (bill_references_json)
- [ ] Matcher priority scoring enhanced
- [ ] Tests passing for direct bill number matches
- [ ] Matchability increases by 10-15% (claims with bill numbers now matchable)
- [ ] False positive rate: Still 0%
- [ ] Re-run on existing 60-100 claims: expect 5-10 new matches

---

## Step 3: Add Vote Verification

**Goal:** Check actual vote records, not just sponsorship/action data

### Current Limitation
Matcher shows:
- Bill introduced by member
- Bill actions (committee, floor activity)

**Missing:**
- Did member actually vote for/against this bill?
- What was the roll call result?
- When did the vote happen?

### Implementation Plan

#### 3.1 Ingest Vote Data
**Source:** Congress.gov API - Roll Call Votes
- Endpoint: `/v3/vote/{congress}/{chamber}/{rollCallNumber}`
- Data: Member-by-member vote records

**New connector:**
```python
# connectors/congress_votes.py (already exists!)
def fetch_roll_call_vote(congress: int, chamber: str, roll_call: int):
    """Fetch roll call vote details including member votes."""
    url = f"{BASE_URL}/vote/{congress}/{chamber}/{roll_call}"
    response = requests.get(url, params={'api_key': API_KEY})
    return response.json()
```

**Database schema (check if exists):**
```python
class Vote(Base):
    __tablename__ = "votes"
    
    id = Column(Integer, primary_key=True)
    congress = Column(Integer, nullable=False)
    chamber = Column(String, nullable=False)  # house, senate
    roll_call_number = Column(Integer, nullable=False)
    bill_id = Column(String, ForeignKey("bills.bill_id"))
    
    vote_date = Column(Date, nullable=False)
    vote_question = Column(Text)  # "On Passage", "On Amendment"
    vote_result = Column(String)  # "Passed", "Failed"
    
    # Vote counts
    yeas = Column(Integer)
    nays = Column(Integer)
    present = Column(Integer)
    not_voting = Column(Integer)
    
    created_at = Column(DateTime, server_default=func.now())

class MemberVote(Base):
    __tablename__ = "member_votes"
    
    id = Column(Integer, primary_key=True)
    vote_id = Column(Integer, ForeignKey("votes.id"))
    bioguide_id = Column(String, nullable=False)  # Links to TrackedMember
    vote_cast = Column(String, nullable=False)  # "Yea", "Nay", "Present", "Not Voting"
    
    created_at = Column(DateTime, server_default=func.now())
```

#### 3.2 Link Bills to Votes
**Enhancement to Bill model:**
```python
class Bill(Base):
    # ... existing fields ...
    
    # Relationship to votes
    votes = relationship("Vote", back_populates="bill")
```

#### 3.3 Enhance Matching with Vote Verification
**File:** `services/matching.py`

```python
def verify_member_vote(claim: Claim, bill: Bill) -> dict:
    """Check if member actually voted on this bill.
    
    Returns:
        {
            'voted': bool,
            'vote_cast': 'Yea' | 'Nay' | 'Present' | 'Not Voting',
            'vote_date': date,
            'vote_question': str,
            'alignment': bool  # Does vote align with claim intent?
        }
    """
    # Get member's bioguide_id
    member = db.query(TrackedMember).filter(
        TrackedMember.person_id == claim.person_id
    ).first()
    
    # Find votes on this bill
    votes = db.query(Vote).filter(Vote.bill_id == bill.bill_id).all()
    
    for vote in votes:
        # Check if member voted
        member_vote = db.query(MemberVote).filter(
            MemberVote.vote_id == vote.id,
            MemberVote.bioguide_id == member.bioguide_id
        ).first()
        
        if member_vote:
            # Check alignment with claim intent
            alignment = check_vote_alignment(claim, member_vote)
            
            return {
                'voted': True,
                'vote_cast': member_vote.vote_cast,
                'vote_date': vote.vote_date,
                'vote_question': vote.vote_question,
                'alignment': alignment
            }
    
    return {'voted': False}
```

#### 3.4 Update Evidence Scoring
```python
EVIDENCE_TYPES = {
    'direct_bill_number': 30,
    'vote_verified_aligned': 25,   # NEW: Voted + aligns with claim
    'vote_verified_misaligned': -20,  # NEW: Voted AGAINST claim
    'url_match': 20,
    'title_overlap': 15,
    # ...
}
```

### Vote Alignment Logic

**Claim intent patterns:**
```python
INTENT_PATTERNS = {
    'voted_for': [
        r'\bvoted for\b',
        r'\bsupported\b',
        r'\bproud to vote for\b',
        r'\bcast my vote for\b'
    ],
    'voted_against': [
        r'\bvoted against\b',
        r'\bopposed\b',
        r'\bvoted no on\b'
    ],
    'introduced': [
        r'\bintroduced\b',
        r'\bsponsored\b',
        r'\bco-sponsored\b'
    ]
}
```

**Alignment check:**
```python
def check_vote_alignment(claim: Claim, member_vote: MemberVote) -> bool:
    """Check if vote aligns with claim intent."""
    
    # If claim says "voted for" and member voted "Yea" → aligned
    if claim.intent == 'voted_for' and member_vote.vote_cast == 'Yea':
        return True
    
    # If claim says "voted against" and member voted "Nay" → aligned
    if claim.intent == 'voted_against' and member_vote.vote_cast == 'Nay':
        return True
    
    # If claim says "introduced" and member is sponsor → aligned
    # (check bill.sponsor_bioguide_id)
    
    return False
```

### Backfill Strategy

1. **Identify bills with floor votes**
   ```sql
   SELECT DISTINCT bill_id FROM actions 
   WHERE action_text LIKE '%passage%' 
   OR action_text LIKE '%final vote%'
   ```

2. **Fetch roll call data for those bills**
   - Parse action metadata for roll call numbers
   - Call `/vote/{congress}/{chamber}/{rollCall}`
   - Insert into votes + member_votes tables

3. **Re-run evaluations**
   ```bash
   python jobs/recompute_evaluations.py --with-vote-verification
   ```

### Success Metrics (Step 3)
- [ ] Vote/MemberVote tables created (or verified existing)
- [ ] Vote data ingested for bills with floor votes
- [ ] Vote verification integrated into matcher
- [ ] Evidence scoring includes vote_verified_aligned/misaligned
- [ ] Claim intent detection enhanced (voted_for, voted_against)
- [ ] Test cases passing for vote alignment checks
- [ ] Baseline snapshot shows vote evidence in matches

---

## Step 4: Build Minimal Web UI (Read-Only)

**Goal:** Validate data model in real-life interface

### Tech Stack (Minimal)
- **Backend:** FastAPI (already using for main.py API)
- **Frontend:** Vanilla HTML/CSS + Alpine.js (no build step)
- **Styling:** Tailwind CDN (no npm)
- **Deployment:** Local first, Railway/Render later

### UI Pages (4 pages only)

#### Page 1: Member List
**Route:** `/ui/members`

**Display:**
```
╔════════════════════════════════════════════════════╗
║ WE THE PEOPLE - Legislative Ledger                ║
╚════════════════════════════════════════════════════╝

MEMBERS (10)

┌─────────────────────────────────────────────────┐
│ Alexandria Ocasio-Cortez (D-NY)                │
│ 4 claims · 3 matches (75%)                     │
│ [View →]                                        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Chuck Schumer (D-NY)                            │
│ 8 claims · 4 matches (50%)                     │
│ [View →]                                        │
└─────────────────────────────────────────────────┘

... (8 more members)
```

**Data source:**
```python
@app.get("/ui/members")
async def member_list(request: Request):
    db = SessionLocal()
    members = db.query(TrackedMember).filter(TrackedMember.is_active == 1).all()
    
    # Enrich with claim counts
    member_data = []
    for m in members:
        claims = db.query(Claim).filter(Claim.person_id == m.person_id).all()
        matches = [c for c in claims if c.evaluations and c.evaluations[0].tier != 'none']
        
        member_data.append({
            'id': m.person_id,
            'name': m.display_name,
            'party': m.party,
            'state': m.state,
            'claim_count': len(claims),
            'match_count': len(matches),
            'match_rate': f"{len(matches)/len(claims)*100:.0f}%" if claims else "0%"
        })
    
    return templates.TemplateResponse("members.html", {
        "request": request,
        "members": member_data
    })
```

#### Page 2: Member Detail
**Route:** `/ui/members/{person_id}`

**Display:**
```
╔════════════════════════════════════════════════════╗
║ Alexandria Ocasio-Cortez (D-NY)                   ║
╚════════════════════════════════════════════════════╝

CLAIMS (4)                        MATCHES: 3 (75%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ MATCHED
"I urge Speaker Johnson to put the DEFIANCE Act on..."

  📋 Bill: H.R. 3562 - DEFIANCE Act (119th Congress)
  🗓️  Claim date: Jan 22, 2026
  📊 Score: 51 | Tier: moderate
  
  Evidence:
    • Direct bill number mention (H.R. 3562)
    • URL match: defiance-act
    • Progress: Passed committee
  
  [View details →]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ UNMATCHED
"100 years ago we had market concentration..."

  📋 No bill match
  🗓️  Claim date: Jan 15, 2026
  
  Reason: General policy statement (no specific bill)
  
  [View details →]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
... (2 more claims)
```

**Data source:**
```python
@app.get("/ui/members/{person_id}")
async def member_detail(person_id: str, request: Request):
    db = SessionLocal()
    member = db.query(TrackedMember).filter(
        TrackedMember.person_id == person_id
    ).first()
    
    claims = db.query(Claim).filter(
        Claim.person_id == person_id
    ).order_by(Claim.claim_date.desc()).all()
    
    # Enrich with evaluations and bills
    claim_data = []
    for c in claims:
        eval = c.evaluations[0] if c.evaluations else None
        bill = None
        
        if eval and eval.matched_bill_id:
            bill = db.query(Bill).filter(Bill.bill_id == eval.matched_bill_id).first()
        
        claim_data.append({
            'id': c.id,
            'text': c.text[:200] + '...' if len(c.text) > 200 else c.text,
            'date': c.claim_date,
            'source_url': c.claim_source_url,
            'matched': eval.tier != 'none' if eval else False,
            'bill': {
                'id': bill.bill_id,
                'title': bill.title,
                'congress': bill.congress
            } if bill else None,
            'score': eval.score if eval else None,
            'tier': eval.tier if eval else None,
            'evidence': eval.evidence_json if eval else None
        })
    
    return templates.TemplateResponse("member_detail.html", {
        "request": request,
        "member": member,
        "claims": claim_data
    })
```

#### Page 3: Claim Detail
**Route:** `/ui/claims/{claim_id}`

**Display:**
```
╔════════════════════════════════════════════════════╗
║ Claim #2 - Alexandria Ocasio-Cortez               ║
╚════════════════════════════════════════════════════╝

CLAIM TEXT
"I also want to shoutout Omny Miranda Martone, founder 
and CEO of the Sexual Violence Prevention Association, 
for her tireless work advocating for survivors. This 
legislation builds on progress made by the passage of 
the TAKE IT DOWN Act..."

SOURCE
🔗 ocasio-cortez.house.gov/press-releases/...
📅 Published: Jan 22, 2026

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATCHED BILL

📋 H.R. 3562 - Disrupt Explicit Forged Images and 
   Non-Consensual Edits Act (DEFIANCE Act)

🏛️  119th Congress (2025-2026)
👤 Sponsor: Rep. Ocasio-Cortez (D-NY)
📊 Status: Passed Committee (House Judiciary)

Latest action:
  "Ordered to be Reported by Voice Vote"
  Dec 12, 2025

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVALUATION

Score: 51 | Tier: moderate

Evidence (3 signals):
  ✓ URL match: defiance-act (20 pts)
  ✓ Progress: Passed committee (5 pts)
  ✓ Timing: Retroactive credit (10 pts)

Confidence: MEDIUM
  Member is bill sponsor
  Claim made after committee passage
  No floor vote yet

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIMELINE

Jan 22, 2026  → Claim published
Dec 12, 2025  → Committee vote (passed)
Oct 15, 2025  → Referred to committee
Aug 3, 2025   → Bill introduced
```

#### Page 4: Bill Detail
**Route:** `/ui/bills/{bill_id}`

**Display:**
```
╔════════════════════════════════════════════════════╗
║ H.R. 3562 - DEFIANCE Act (119th Congress)         ║
╚════════════════════════════════════════════════════╝

BILL DETAILS
Full title: Disrupt Explicit Forged Images and 
Non-Consensual Edits Act of 2025

Sponsor: Rep. Alexandria Ocasio-Cortez (D-NY)
Introduced: Aug 3, 2025
Status: Passed Committee

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLAIMS REFERENCING THIS BILL (3)

✅ Claim #2 (Alexandria Ocasio-Cortez)
   "I urge Speaker Johnson to put this on the floor..."
   Jan 22, 2026 · Score: 51 · moderate
   [View →]

✅ Claim #3 (Alexandria Ocasio-Cortez)
   "This legislation builds on the TAKE IT DOWN Act..."
   Jan 22, 2026 · Score: 50 · moderate
   [View →]

✅ Claim #4 (Alexandria Ocasio-Cortez)
   "I also want to shoutout Omny Miranda Martone..."
   Jan 22, 2026 · Score: 51 · moderate
   [View →]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEGISLATIVE TIMELINE

Dec 12, 2025  Ordered to be Reported by Voice Vote
Oct 15, 2025  Referred to House Judiciary Committee
Aug 3, 2025   Introduced in House
```

### File Structure
```
wethepeople-backend/
├── main.py (existing API)
├── ui/
│   ├── __init__.py
│   ├── routes.py          # FastAPI routes for UI
│   └── templates/
│       ├── base.html      # Shared layout
│       ├── members.html
│       ├── member_detail.html
│       ├── claim_detail.html
│       └── bill_detail.html
```

### Implementation (FastAPI + Jinja2)

**ui/routes.py:**
```python
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from models.database import SessionLocal, Claim, ClaimEvaluation, Bill, TrackedMember

router = APIRouter(prefix="/ui", tags=["UI"])
templates = Jinja2Templates(directory="ui/templates")

@router.get("/members")
async def member_list(request: Request):
    # ... implementation above ...
    
@router.get("/members/{person_id}")
async def member_detail(person_id: str, request: Request):
    # ... implementation above ...

@router.get("/claims/{claim_id}")
async def claim_detail(claim_id: int, request: Request):
    # ... similar pattern ...

@router.get("/bills/{bill_id}")
async def bill_detail(bill_id: str, request: Request):
    # ... similar pattern ...
```

**main.py:**
```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from ui.routes import router as ui_router

app = FastAPI()

# Mount UI routes
app.include_router(ui_router)

# ... existing API routes ...
```

### Success Metrics (Step 4)
- [ ] 4 UI pages implemented (members, member detail, claim detail, bill detail)
- [ ] Read-only (no edit/delete functionality)
- [ ] Displays all evaluation data correctly
- [ ] Evidence breakdown visible
- [ ] Timeline shows claim date vs bill actions
- [ ] Links between pages work (member → claims → bills)
- [ ] Manual validation: spot-check 10 claims for accuracy

---

## Phase 1 Success Criteria (ALL STEPS)

### Volume Metrics
- [ ] 8-10 members onboarded
- [ ] 60-100 claims ingested
- [ ] 20-30 meaningful matches (tier != 'none')
- [ ] Overall matchability: 35-45%
- [ ] Match rate: 20-30%

### Quality Metrics
- [ ] False positive rate: 0%
- [ ] All quality gates passing
- [ ] Hash deduplication: 100% effective
- [ ] Vote verification: Working for floor votes
- [ ] Bill number extraction: Increasing matchability by 10-15%

### System Metrics
- [ ] Matcher performance stable (no degradation at scale)
- [ ] Evidence scoring consistent across members
- [ ] Tier distribution reasonable (not all 'none', not all 'strong')
- [ ] Baseline snapshot shows healthy diversity

### UI Validation
- [ ] All 4 pages rendering correctly
- [ ] Data model validated in real-world display
- [ ] Evidence explanations make sense to humans
- [ ] Timeline logic clear and accurate

---

## Roadmap Timeline

### Week 1-2: Step 1 (Members 4-6)
- Add Schumer, Wyden, Porter
- Run onboarding checklist for each
- Quality gate after each
- Monitor metrics

### Week 3-4: Step 1 (Members 7-8)
- Add Klobuchar, Khanna
- Validate matcher stability
- Check false positive drift

### Week 5-6: Step 1 (Members 9-10) + Step 2 Start
- Add Booker, Jayapal
- Implement bill number extraction
- Database schema updates

### Week 7-8: Step 2 Complete + Step 3 Start
- Test bill number matching
- Re-run on existing claims
- Begin vote data ingestion

### Week 9-10: Step 3 Complete + Step 4 Start
- Vote verification integrated
- UI skeleton built
- Member list + member detail pages

### Week 11-12: Step 4 Complete + Phase 1 Review
- Claim detail + bill detail pages
- Manual validation of 20+ claims via UI
- Final baseline snapshot
- **PHASE 1 LOCKED** ✅

---

## Next: Phase 2 (Oversight Actions)

Only after Phase 1 is locked:
- Investigations
- Letters to agencies
- Hearing questions
- Oversight reports

These will inherit trust from the Legislative Ledger foundation.

---

## Files to Create/Modify (Phase 1)

### Step 1 (Member Expansion)
- [ ] 7 new source config files (data/<member>_sources.json)
- [ ] Update onboarding checklist with new members
- [ ] 7 new acceptance reports

### Step 2 (Bill Number Extraction)
- [ ] Migration: Add bill_references_json to Claim model
- [ ] services/claim_ingestion.py - extract_bill_references()
- [ ] services/matching.py - priority scoring for direct mentions
- [ ] tests/test_bill_number_extraction.py
- [ ] Update EVIDENCE_TYPES in matching.py

### Step 3 (Vote Verification)
- [ ] Migration: Verify/create votes + member_votes tables
- [ ] connectors/congress_votes.py - enhance fetch_roll_call_vote()
- [ ] services/matching.py - verify_member_vote()
- [ ] jobs/backfill_vote_data.py
- [ ] tests/test_vote_verification.py

### Step 4 (Web UI)
- [ ] ui/__init__.py
- [ ] ui/routes.py
- [ ] ui/templates/base.html
- [ ] ui/templates/members.html
- [ ] ui/templates/member_detail.html
- [ ] ui/templates/claim_detail.html
- [ ] ui/templates/bill_detail.html
- [ ] main.py - mount UI router

---

## Decision: Start with Step 1?

Ready to begin controlled member expansion (Schumer, Wyden, Porter)?

Or do you want to tackle Step 2 (bill number extraction) first to boost matchability before adding more members?

**Recommendation:** Start with Step 1 (add 3 high-signal members) to validate matcher at moderate scale, THEN add Step 2 to boost matchability for remaining members.
