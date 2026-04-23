/**
 * Chat assistant API client.
 */

import { getApiBaseUrl } from './client';

const API_BASE = getApiBaseUrl();

// ── Types ──

export interface ChatAction {
  type: 'navigate' | 'search';
  path?: string;
  query?: string;
}

export interface ChatResponse {
  answer: string;
  action?: ChatAction | null;
  cached: boolean;
}

interface RemainingResponse {
  remaining: number;
  limit: number;
}

// ── API Functions ──

export async function askQuestion(
  question: string,
  context?: { page: string; entity_id?: string }
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  if (res.status === 429) {
    const data = await res.json();
    throw new Error(data.detail || 'Daily question limit reached. Try again tomorrow.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getRemainingQuestions(): Promise<RemainingResponse> {
  const res = await fetch(`${API_BASE}/chat/remaining`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
