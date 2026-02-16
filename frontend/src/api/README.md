# Frontend API Client

Type-safe API client with runtime validation to prevent silent bugs.

## Philosophy

**Fail fast, fail loud.** If the backend contract changes, the frontend should throw immediately rather than render garbage. This saves hours of debugging "why is the UI broken?"

## Usage

```typescript
import { apiClient } from './api';

// All responses are fully typed and validated at runtime
const response = await apiClient.getPeople({
  active_only: true,
  has_ledger: true,
  limit: 50,
  offset: 0,
});

// TypeScript knows the exact shape:
console.log(`Found ${response.total} people`);
response.people.forEach(person => {
  console.log(person.display_name); // ✓ Autocomplete works
});
```

## Contract Enforcement

Each API call validates the response shape at runtime:

```typescript
// ✓ Valid response - works fine
{ total: 6, people: [...], limit: 50, offset: 0 }

// ✗ Contract violation - throws ContractViolationError
{ people: [...] }  // Missing 'total' field
```

## Error Handling

```typescript
try {
  const data = await apiClient.getPeople();
} catch (error) {
  if (error.name === 'ContractViolationError') {
    // Backend contract broken - show error panel to user
    showErrorPanel('API contract violation', error.message);
  } else {
    // Network or other error
    showErrorPanel('Failed to load data', error.message);
  }
}
```

## Available Endpoints

- `getPeople(params)` → `/people`
- `getLedgerPerson(personId, params)` → `/ledger/person/{id}`
- `getLedgerClaim(claimId)` → `/ledger/claim/{id}`
- `getBill(billId)` → `/bills/{id}`
- `getBillTimeline(billId)` → `/bills/{id}/timeline`
- `getRuntimeInfo()` → `/ops/runtime` (dev only)

## Configuration

Set `VITE_API_BASE_URL` in `.env`:

```bash
VITE_API_BASE_URL=http://localhost:8002
```

Default: `http://localhost:8002`

## Type Definitions

All types are in `api/types.ts` and match the backend contract tests exactly:

- `PeopleResponse` - matches `test_api_people_contract.py`
- `LedgerPersonResponse` - matches `test_api_ledger_person_fields_contract.py`
- `LedgerClaimResponse` - matches `test_api_ledger_claim_contract.py`
- `BillResponse` - matches `test_api_bill_contract.py`
- `BillTimelineResponse` - matches `test_api_bill_timeline_contract.py`

## Dev Health Checks

When you run `.\scripts\dev_up.ps1`, it automatically validates:

1. ✓ DB is `wethepeople.db` (not `wtp.db`)
2. ✓ Startup fetch is disabled
3. ✓ CORS is configured
4. ✓ At least 1 person with ledger entries exists

This prevents "wrong server / wrong DB" issues.
