/**
 * Example usage of the typed API client
 * 
 * This demonstrates:
 * 1. How to use the client with full type safety
 * 2. How contract violations throw immediately
 * 3. How to handle errors gracefully
 */

import { apiClient } from './client';

// Example 1: Fetch people with ledger entries
async function exampleGetPeople() {
  try {
    const response = await apiClient.getPeople({
      active_only: true,
      has_ledger: true,
      limit: 10,
      offset: 0,
    });

    console.log(`Found ${response.total} people`);
    response.people.forEach((person: any) => {
      console.log(`- ${person.display_name} (${person.person_id})`);
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'ContractViolationError') {
      // Backend contract was violated - show error to user
      console.error('API contract broken:', error.message);
      // In UI: show error panel
    } else {
      // Network or other error
      console.error('Failed to fetch people:', error);
    }
  }
}

// Example 2: Full drilldown (Person → Claim → Bill)
async function exampleDrilldown(personId: string) {
  try {
    // Step 1: Get person's ledger
    const ledger = await apiClient.getLedgerForPerson(personId, {
      limit: 10,
      offset: 0,
    });

    console.log(`Person ${personId} has ${ledger.total} ledger entries`);

    if (ledger.entries.length === 0) return;

    // Step 2: Get first claim detail
    const firstEntry = ledger.entries[0];
    const claim = await apiClient.getClaim(firstEntry.claim_id);

    console.log(`Claim ${claim.claim_id}: ${claim.normalized_text.slice(0, 100)}...`);
    console.log(`Tier: ${claim.tier}`);

    // Step 3: If matched, get bill
    if (claim.matched_bill_id) {
      const bill = await apiClient.getBill(claim.matched_bill_id);
      console.log(`Matched bill: ${bill.title}`);

      // Step 4: Get bill timeline
      const timeline = await apiClient.getBillTimeline(claim.matched_bill_id);
      console.log(`Timeline has ${timeline.actions.length} actions`);
    } else {
      console.log('No matched bill');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ContractViolationError') {
      console.error('API contract broken:', error.message);
      // In UI: show single error panel explaining the issue
    } else {
      console.error('Drilldown failed:', error);
    }
  }
}

// Example 3: Check runtime config (dev only)
async function exampleCheckRuntime() {
  try {
    const runtime = await apiClient.getRuntimeInfo();
    console.log('Runtime config:');
    console.log(`  DB: ${runtime.db_file}`);
    console.log(`  Startup fetch disabled: ${runtime.disable_startup_fetch}`);
    console.log(`  CORS origins: ${runtime.cors_origins.join(', ')}`);
  } catch (error) {
    console.error('Failed to get runtime info:', error);
  }
}

// Run examples (in dev environment)
// Uncomment to test:
// exampleGetPeople();
// exampleDrilldown('alexandria_ocasio_cortez');
// exampleCheckRuntime();
