"""
Chat assistant router — AI-powered conversational interface for WeThePeople.

Three-tier intent resolution:
  1. Cached Q&A pairs (free, instant)
  2. Claude Haiku API fallback (cheap, rate-limited)

Rate limit: 10 Haiku questions per IP per day (free tier).
"""

import hashlib
import logging
import os
import threading
import time
from typing import Optional

from cachetools import TTLCache

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.rate_limit_store import check_rate_limit

logger = logging.getLogger(__name__)

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
# Rate limiting (10 Haiku calls / day / IP) — persistent SQLite store
# ---------------------------------------------------------------------------

_CHAT_FREE_LIMIT = int(os.getenv("WTP_CHAT_FREE_LIMIT", "10"))
_CHAT_WINDOW = 86400  # 24 hours


def _get_remaining_questions(ip: str) -> int:
    """Return how many Haiku questions this IP has left today (read-only)."""
    from models.database import get_db
    from services.rate_limit_store import RateLimitRecord
    db = next(get_db())
    try:
        cutoff = time.time() - _CHAT_WINDOW
        count = (
            db.query(RateLimitRecord)
            .filter(
                RateLimitRecord.ip_address == ip,
                RateLimitRecord.endpoint == "chat",
                RateLimitRecord.window_start >= cutoff,
            )
            .count()
        )
        return max(0, _CHAT_FREE_LIMIT - count)
    finally:
        db.close()


def _consume_rate_limit(ip: str) -> int:
    """Consume one rate limit token. Returns remaining. Raises 429 if exhausted."""
    allowed, remaining, _ = check_rate_limit(
        ip=ip,
        endpoint="chat",
        max_requests=_CHAT_FREE_LIMIT,
        window_seconds=_CHAT_WINDOW,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached: {_CHAT_FREE_LIMIT} AI questions per day. "
                   f"Try again tomorrow, or ask a question that can be answered from our FAQ.",
        )
    return remaining


# ---------------------------------------------------------------------------
# Response cache (in-memory, keyed by normalized question hash)
# ---------------------------------------------------------------------------

_response_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)
_cache_lock = threading.Lock()


def _cache_key(question: str) -> str:
    normalized = question.lower().strip()
    # Remove common filler words for better matching
    for word in ["please", "can you", "could you", "tell me", "show me", "what is", "what are"]:
        normalized = normalized.replace(word, "")
    normalized = " ".join(normalized.split())  # collapse whitespace
    return hashlib.md5(normalized.encode()).hexdigest()


def _cache_get(question: str) -> Optional[dict]:
    key = _cache_key(question)
    with _cache_lock:
        return _response_cache.get(key)


def _cache_set(question: str, response: dict) -> None:
    key = _cache_key(question)
    with _cache_lock:
        _response_cache[key] = response


# ---------------------------------------------------------------------------
# Haiku system prompt
# ---------------------------------------------------------------------------

_DEFAULT_CHAT_PROMPT = (
    "You are an assistant for a civic transparency platform. "
    "Be concise. Direct users to relevant pages. Never make up data."
)
CHAT_SYSTEM_PROMPT = os.getenv("CHAT_SYSTEM_PROMPT", _DEFAULT_CHAT_PROMPT).replace("\\n", "\n")


# ---------------------------------------------------------------------------
# Haiku call
# ---------------------------------------------------------------------------

def _call_haiku(question: str, context: Optional[dict] = None) -> dict:
    """Call Claude Haiku and parse the response."""
    from services.llm.client import get_llm_client
    from services.budget import check_budget, record_spend, compute_cost

    # Budget check before calling
    allowed, remaining = check_budget(estimated_cost=0.005)
    if not allowed:
        return {"answer": "I'm temporarily unavailable. Please try again later.", "action": None, "cached": False}

    client = get_llm_client()

    user_message = question
    if context:
        import re
        # Sanitize context fields to prevent prompt injection
        page = re.sub(r'[^a-zA-Z0-9/_-]', '', context.get("page", "unknown"))[:60]
        entity_id = re.sub(r'[^a-zA-Z0-9_-]', '', context.get("entity_id", ""))[:60]
        user_message = f"[User is on page: {page}"
        if entity_id:
            user_message += f", viewing entity: {entity_id}"
        user_message += f"]\n\n{question}"

    model = "claude-haiku-4-5-20251001"
    response = client.messages.create(
        model=model,
        max_tokens=500,
        system=CHAT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    # Record spend and log usage
    if hasattr(response, 'usage') and response.usage:
        in_tok = getattr(response.usage, 'input_tokens', 0) or 0
        out_tok = getattr(response.usage, 'output_tokens', 0) or 0
        cost = compute_cost(model, in_tok, out_tok)
        record_spend(cost, model, in_tok, out_tok)
        from services.budget import log_token_usage
        log_token_usage("chat_agent", model, in_tok, out_tok, cost, question[:100])

    if not response.content:
        text = "I wasn't able to generate a response. Please try rephrasing your question."
    else:
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
    logger.info("Chat question received: %r", question[:100])

    # Check cache first (free, no rate limit consumed)
    cached = _cache_get(question)
    if cached:
        return ChatResponse(
            answer=cached["answer"],
            action=ChatAction(**cached["action"]) if cached.get("action") else None,
            cached=True,
        )

    # Use X-Forwarded-For (first hop) if behind reverse proxy, else direct client IP
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")

    # Consume rate limit BEFORE the Haiku call to prevent race conditions
    remaining = _consume_rate_limit(client_ip)

    # Call Haiku
    try:
        result = _call_haiku(question, body.context)
    except ValueError as e:
        # ANTHROPIC_API_KEY not set
        raise HTTPException(status_code=503, detail="AI chat is temporarily unavailable.")
    except Exception as e:
        logger.error("AI request failed: %s", e)
        raise HTTPException(status_code=500, detail="AI request failed. Please try again later.")

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
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    try:
        remaining = _get_remaining_questions(client_ip)
    except Exception as e:
        logger.warning("rate limit check failed (table may not exist): %s", e)
        remaining = _CHAT_FREE_LIMIT
    return {"remaining": remaining, "limit": _CHAT_FREE_LIMIT}
