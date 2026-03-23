"""
Chat assistant router — AI-powered conversational interface for WeThePeople.

Three-tier intent resolution:
  1. Cached Q&A pairs (free, instant)
  2. Claude Haiku API fallback (cheap, rate-limited)

Rate limit: 10 Haiku questions per IP per day (free tier).
"""

import hashlib
import os
import time
from collections import defaultdict
from threading import Lock
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["chat"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="User question")
    context: Optional[dict] = Field(None, description="Current page context: {page, entity_id}")


class ChatAction(BaseModel):
    type: str  # 'navigate' | 'search'
    path: Optional[str] = None
    query: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    action: Optional[ChatAction] = None
    cached: bool = False


# ---------------------------------------------------------------------------
# Rate limiting (10 Haiku calls / day / IP)
# ---------------------------------------------------------------------------

_chat_rate_store: dict = defaultdict(list)
_chat_rate_lock = Lock()
_CHAT_FREE_LIMIT = int(os.getenv("WTP_CHAT_FREE_LIMIT", "10"))
_CHAT_WINDOW = 86400  # 24 hours


def _get_remaining_questions(ip: str) -> int:
    """Return how many Haiku questions this IP has left today."""
    cutoff = time.time() - _CHAT_WINDOW
    with _chat_rate_lock:
        _chat_rate_store[ip] = [t for t in _chat_rate_store[ip] if t > cutoff]
        return max(0, _CHAT_FREE_LIMIT - len(_chat_rate_store[ip]))


def _consume_rate_limit(ip: str) -> int:
    """Consume one rate limit token. Returns remaining. Raises 429 if exhausted."""
    cutoff = time.time() - _CHAT_WINDOW
    with _chat_rate_lock:
        _chat_rate_store[ip] = [t for t in _chat_rate_store[ip] if t > cutoff]
        if len(_chat_rate_store[ip]) >= _CHAT_FREE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit reached: {_CHAT_FREE_LIMIT} AI questions per day. "
                       f"Try again tomorrow, or ask a question that can be answered from our FAQ.",
            )
        _chat_rate_store[ip].append(time.time())
        return max(0, _CHAT_FREE_LIMIT - len(_chat_rate_store[ip]))


# ---------------------------------------------------------------------------
# Response cache (in-memory, keyed by normalized question hash)
# ---------------------------------------------------------------------------

_response_cache: dict[str, dict] = {}
_CACHE_MAX_SIZE = 500


def _cache_key(question: str) -> str:
    normalized = question.lower().strip()
    # Remove common filler words for better matching
    for word in ["please", "can you", "could you", "tell me", "show me", "what is", "what are"]:
        normalized = normalized.replace(word, "")
    normalized = " ".join(normalized.split())  # collapse whitespace
    return hashlib.md5(normalized.encode()).hexdigest()


def _cache_get(question: str) -> Optional[dict]:
    key = _cache_key(question)
    return _response_cache.get(key)


def _cache_set(question: str, response: dict) -> None:
    if len(_response_cache) >= _CACHE_MAX_SIZE:
        # Evict oldest 100 entries
        keys = list(_response_cache.keys())[:100]
        for k in keys:
            _response_cache.pop(k, None)
    _response_cache[_cache_key(question)] = response


# ---------------------------------------------------------------------------
# Haiku system prompt
# ---------------------------------------------------------------------------

CHAT_SYSTEM_PROMPT = """You are an assistant for WeThePeople, a civic transparency platform that tracks how corporations lobby Congress, win government contracts, face enforcement actions, and donate to politicians.

The platform covers 6 sectors: Politics, Finance, Health, Technology, Energy, and Transportation. It tracks lobbying records, government contracts, enforcement actions, congressional trades, political donations, legislation, votes, and more.

Key data:
- 547 politicians tracked with voting records, trades, committee memberships
- 500+ companies tracked across all sectors
- Data from 26 sources including Congress.gov, Senate LDA, USASpending.gov, FEC, SEC EDGAR, OpenFDA
- Most data syncs daily. Lobbying updates quarterly. Congressional trades within 24-48h of disclosure.

IMPORTANT RULES:
1. Be concise — 2-3 sentences max for simple questions.
2. If the user wants to navigate somewhere, respond with EXACTLY this JSON on a line by itself:
   ACTION:{"type":"navigate","path":"/the/path"}
3. If the user wants to search for something, respond with:
   ACTION:{"type":"search","query":"the search term"}
4. For data questions, be factual and brief. If you don't know a specific number, say so and suggest where on the platform they can find it.
5. Never make up data. If unsure, direct users to the relevant page.

Available pages:
- /politics — Politics dashboard
- /politics/people — All tracked politicians
- /politics/people/{person_id} — Politician profile (use lowercase, hyphenated names like "nancy-pelosi")
- /politics/trades — Congressional stock trades
- /politics/legislation — Bill tracker
- /politics/committees — Committee explorer
- /politics/find-rep — Find your representative
- /politics/lobbying — Political lobbying records
- /politics/contracts — Government contracts
- /politics/enforcement — Enforcement actions
- /politics/states — State explorer
- /finance — Finance dashboard
- /finance/institutions — All financial institutions
- /finance/insider-trades — Insider trading dashboard
- /finance/complaints — CFPB complaints
- /health — Health dashboard
- /health/companies — Health companies
- /health/drugs — Drug lookup
- /health/pipeline — Clinical trial pipeline
- /technology — Technology dashboard
- /technology/companies — Tech companies
- /technology/patents — Patent search
- /energy — Energy dashboard
- /energy/companies — Energy companies
- /transportation — Transportation dashboard
- /influence — Influence explorer hub
- /influence/map — Spending map (choropleth)
- /influence/network — Influence network graph
- /influence/money-flow — Money flow Sankey diagram
- /influence/explorer — Data explorer
- /influence/story — Data story
- /influence/timeline — Influence timeline
- /influence/closed-loops — Closed loop detection
- /verify — Claim verification
- /methodology — Data methodology
"""


# ---------------------------------------------------------------------------
# Haiku call
# ---------------------------------------------------------------------------

def _call_haiku(question: str, context: Optional[dict] = None) -> dict:
    """Call Claude Haiku and parse the response."""
    from services.llm.client import get_llm_client

    client = get_llm_client()

    user_message = question
    if context:
        page = context.get("page", "unknown")
        entity_id = context.get("entity_id")
        user_message = f"[User is on page: {page}"
        if entity_id:
            user_message += f", viewing entity: {entity_id}"
        user_message += f"]\n\n{question}"

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        system=CHAT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text.strip()

    # Parse out ACTION: lines
    action = None
    answer_lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("ACTION:"):
            import json
            try:
                action_data = json.loads(stripped[7:])
                action = action_data
            except json.JSONDecodeError:
                answer_lines.append(line)
        else:
            answer_lines.append(line)

    answer = "\n".join(answer_lines).strip()
    if not answer and action:
        # If the entire response was just an action, provide a brief message
        if action.get("type") == "navigate":
            answer = "Taking you there now."
        elif action.get("type") == "search":
            answer = f"Searching for \"{action.get('query', '')}\"..."

    result = {"answer": answer, "cached": False}
    if action:
        result["action"] = action
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ask", response_model=ChatResponse)
def ask_question(body: ChatRequest, request: Request):
    """
    Ask a question about the platform data.

    Checks cache first, then falls back to Claude Haiku.
    Rate limited: 10 AI questions per IP per day.
    """
    question = body.question.strip()

    # Check cache first (free, no rate limit consumed)
    cached = _cache_get(question)
    if cached:
        return ChatResponse(
            answer=cached["answer"],
            action=ChatAction(**cached["action"]) if cached.get("action") else None,
            cached=True,
        )

    # Call Haiku first, then consume rate limit only on success
    client_ip = request.client.host if request.client else "unknown"

    # Pre-check rate limit (don't consume yet)
    if _get_remaining_questions(client_ip) <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached: {_CHAT_FREE_LIMIT} AI questions per day. "
                   f"Try again tomorrow, or ask a question that can be answered from our FAQ.",
        )

    # Call Haiku
    try:
        result = _call_haiku(question, body.context)
    except ValueError as e:
        # ANTHROPIC_API_KEY not set
        raise HTTPException(status_code=503, detail="AI chat is temporarily unavailable.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)[:200]}")

    # Consume rate limit AFTER successful Haiku call
    remaining = _consume_rate_limit(client_ip)

    # Cache the response
    _cache_set(question, result)

    return ChatResponse(
        answer=result["answer"],
        action=ChatAction(**result["action"]) if result.get("action") else None,
        cached=False,
    )


@router.get("/remaining")
def get_remaining_questions(request: Request):
    """Check how many AI questions the caller has remaining today."""
    client_ip = request.client.host if request.client else "unknown"
    remaining = _get_remaining_questions(client_ip)
    return {"remaining": remaining, "limit": _CHAT_FREE_LIMIT}
