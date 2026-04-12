/**
 * Runtime validation for API responses.
 *
 * These validators throw hard if the backend contract is broken.
 * Better to fail fast than render garbage.
 */

import type {
  PeopleResponse,
  LedgerPersonResponse,
  LedgerClaimResponse,
  BillResponse,
  BillTimelineResponse,
  RuntimeInfo,
} from './types';

class ContractViolationError extends Error {
  constructor(endpoint: string, field: string, issue: string) {
    super(`Contract violation: ${endpoint} - ${field}: ${issue}`);
    this.name = 'ContractViolationError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- validators accept unknown JSON and narrow via runtime checks
type JsonValue = any;

function assertField(data: JsonValue, field: string, type: string, endpoint: string) {
  if (!(field in data)) {
    throw new ContractViolationError(endpoint, field, `missing field`);
  }
  if (typeof data[field] !== type) {
    throw new ContractViolationError(
      endpoint,
      field,
      `expected ${type}, got ${typeof data[field]}`
    );
  }
}

function assertNullableField(data: JsonValue, field: string, type: string, endpoint: string) {
  if (!(field in data)) {
    throw new ContractViolationError(endpoint, field, `missing field`);
  }
  if (data[field] !== null && typeof data[field] !== type) {
    throw new ContractViolationError(
      endpoint,
      field,
      `expected ${type} or null, got ${typeof data[field]}`
    );
  }
}

function assertArray(data: JsonValue, field: string, endpoint: string) {
  if (!(field in data)) {
    throw new ContractViolationError(endpoint, field, `missing field`);
  }
  if (!Array.isArray(data[field])) {
    throw new ContractViolationError(endpoint, field, `expected array`);
  }
}

export function validatePeopleResponse(data: JsonValue): asserts data is PeopleResponse {
  const endpoint = '/people';
  assertField(data, 'total', 'number', endpoint);
  assertArray(data, 'people', endpoint);
  assertField(data, 'limit', 'number', endpoint);
  assertField(data, 'offset', 'number', endpoint);

  if (data.people.length > 0) {
    const person = data.people[0];
    assertField(person, 'person_id', 'string', `${endpoint}[0]`);
    assertNullableField(person, 'display_name', 'string', `${endpoint}[0]`);
    assertNullableField(person, 'chamber', 'string', `${endpoint}[0]`);
    assertNullableField(person, 'state', 'string', `${endpoint}[0]`);
    assertNullableField(person, 'party', 'string', `${endpoint}[0]`);
    assertField(person, 'is_active', 'boolean', `${endpoint}[0]`);
  }
}

export function validateLedgerPersonResponse(data: JsonValue): asserts data is LedgerPersonResponse {
  const endpoint = '/ledger/person/{id}';
  assertField(data, 'total', 'number', endpoint);
  assertArray(data, 'entries', endpoint);

  if (data.entries.length > 0) {
    const entry = data.entries[0];
    assertField(entry, 'claim_id', 'number', `${endpoint}[0]`);
    assertField(entry, 'person_id', 'string', `${endpoint}[0]`);
    assertField(entry, 'source_url', 'string', `${endpoint}[0]`);
    assertField(entry, 'tier', 'string', `${endpoint}[0]`);
  }
}

export function validateLedgerClaimResponse(data: JsonValue): asserts data is LedgerClaimResponse {
  const endpoint = '/ledger/claim/{id}';
  assertField(data, 'claim_id', 'number', endpoint);
  assertField(data, 'person_id', 'string', endpoint);
  assertField(data, 'source_url', 'string', endpoint);
  assertField(data, 'tier', 'string', endpoint);
}

export function validateBillResponse(data: JsonValue): asserts data is BillResponse {
  const endpoint = '/bills/{id}';
  assertField(data, 'bill_id', 'string', endpoint);
  assertArray(data, 'timeline', endpoint);
  assertArray(data, 'sponsors', endpoint);
}

export function validateBillTimelineResponse(data: JsonValue): asserts data is BillTimelineResponse {
  const endpoint = '/bills/{id}/timeline';
  assertArray(data, 'actions', endpoint);

  if (data.actions.length > 0) {
    const action = data.actions[0];
    assertField(action, 'bill_id', 'string', `${endpoint}[0]`);
  }
}

export function validateRuntimeInfo(data: JsonValue): asserts data is RuntimeInfo {
  const endpoint = '/ops/runtime';
  assertField(data, 'db_url', 'string', endpoint);
  assertField(data, 'disable_startup_fetch', 'boolean', endpoint);
  assertField(data, 'no_network', 'boolean', endpoint);
  assertArray(data, 'cors_origins', endpoint);
}
