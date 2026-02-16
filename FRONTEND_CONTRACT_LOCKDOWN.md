# Frontend Contract Lock-In Complete

## What Was Built

### 1. Type-Safe API Client (`frontend/src/api/`)

**Files:**
- `types.ts` - TypeScript interfaces matching backend contracts exactly
- `validators.ts` - Runtime validation that throws on contract violations
- `client.ts` - Type-safe wrapper around fetch with automatic validation
- `index.ts` - Clean exports for consumers
- `examples.ts` - Usage examples showing error handling patterns

**Key Features:**
- Every API response is validated at runtime
- Contract violations throw `ContractViolationError` immediately
- Full TypeScript autocomplete and type checking
- Single error panel pattern for contract breaks

**Example Usage:**
```typescript
import { apiClient } from './api';

try {
  const response = await apiClient.getPeople({ has_ledger: true, limit: 10 });
  console.log(`Found ${response.total} people`); // ✓ Typed
} catch (error) {
  if (error.name === 'ContractViolationError') {
    // Backend broke the contract - show error to user
  }
}
```

### 2. Dev Health Checks (`scripts/dev_up.ps1`)

Enhanced startup script now validates runtime configuration automatically:

**Health Checks After Server Starts:**
1. ✓ `GET /ops/runtime` - Verifies `db_file = wethepeople.db`
2. ✓ Verifies `disable_startup_fetch = true`
3. ✓ Verifies CORS origins configured
4. ✓ `GET /people?has_ledger=1` - Verifies `total >= 1`

**Output:**
```
================================================================
DEV HEALTH CHECKS
================================================================

1. Checking /ops/runtime...
   OK: db_file = wethepeople.db
   OK: disable_startup_fetch = true
   OK: cors_origins configured (4 origins)

2. Checking /people?has_ledger=1...
   OK: 6 people with ledger entries

================================================================
SERVER READY ON http://127.0.0.1:8002
================================================================
```

## Why This Matters

### Before
- Frontend could silently consume wrong DB data
- Contract changes broke UI with cryptic errors
- "Works on my machine" but hits wrong server
- Hours lost debugging shape mismatches

### After
- ✅ **Wrong DB detected immediately** - Health checks catch it at startup
- ✅ **Contract violations throw hard** - No silent bugs
- ✅ **Type-safe everywhere** - TypeScript + runtime validation
- ✅ **Single error panel** - Clear contract violation messages

## Contract-Locked Endpoints

All responses validated against backend contract tests:

1. `/people` → `PeopleResponse` (dict with total, people, limit, offset)
2. `/ledger/person/{id}` → `LedgerPersonResponse`
3. `/ledger/claim/{id}` → `LedgerClaimResponse`
4. `/bills/{id}` → `BillResponse`
5. `/bills/{id}/timeline` → `BillTimelineResponse`
6. `/ops/runtime` → `RuntimeInfo` (dev only)

## Next Steps for Frontend

Now that contracts are locked, you can build pages without guessing:

1. **Home** - `apiClient.getPeople({ has_ledger: true })` → Show list with links
2. **Person** - `apiClient.getLedgerPerson(personId)` → Show claim cards
3. **Claim** - `apiClient.getLedgerClaim(claimId)` → Show matched_bill_id link if exists
4. **Bill** - `apiClient.getBill(billId)` + `apiClient.getBillTimeline(billId)` → Show summary + timeline

**No styling needed yet** - Just functional wiring with error boundaries. Once data flow works, iterate on UI.

## Dev Workflow

```powershell
# Start backend with health checks
.\scripts\dev_up.ps1

# In separate terminal: Start frontend
cd frontend
npm run dev
```

Health checks run automatically and tell you if something is misconfigured before you waste time debugging.
