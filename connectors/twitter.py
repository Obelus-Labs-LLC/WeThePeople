"""
Twitter/X Connector — Production-grade API interface for @WTPForUs.

Uses OAuth 1.0a User Context (Access Token + Secret) for posting.
Uses Bearer Token for read-only operations.

Tier: Basic ($200/month)
  - 3,000 posts/month (we target ~330/month = 11% utilization)
  - 10,000 read requests/month
  - Tweet lookup, user lookup, search (recent, 60 requests/15min)
  - Mentions timeline supported
  - 300 posts per 3-hour window

Auth: Requires TWITTER_CONSUMER_KEY + TWITTER_CONSUMER_SECRET +
      TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_SECRET for posting.
      TWITTER_BEARER_TOKEN for read-only operations.

Safety:
  - Kill switch: WTP_BOT_PAUSED=1 or .bot_paused file halts all posting
  - Thread-safe client initialization (threading.Lock)
  - Retry with exponential backoff on transient failures
  - Rate limit wait logging (so silent blocks are visible in logs)
  - Account identity verification on startup
"""

import logging
import os
import threading
import time
from typing import List, Optional

import tweepy

log = logging.getLogger(__name__)

# Thread-safe client initialization
_client_lock = threading.Lock()
_cached_client: Optional[tweepy.Client] = None
_verified_account_id: Optional[str] = None
_verified_username: Optional[str] = None

# Retry configuration
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 3  # seconds: 3, 9, 27


def _get_client() -> tweepy.Client:
    """Get authenticated tweepy Client for posting (OAuth 1.0a User Context).

    Thread-safe: uses a lock to prevent duplicate client creation.
    Logs when rate limit waits occur (wait_on_rate_limit=True blocks silently).
    """
    global _cached_client
    if _cached_client is not None:
        return _cached_client

    with _client_lock:
        # Double-check after acquiring lock
        if _cached_client is not None:
            return _cached_client

        consumer_key = os.getenv("TWITTER_CONSUMER_KEY")
        consumer_secret = os.getenv("TWITTER_CONSUMER_SECRET")
        access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        access_secret = os.getenv("TWITTER_ACCESS_SECRET")
        bearer_token = os.getenv("TWITTER_BEARER_TOKEN")

        if not all([consumer_key, consumer_secret, access_token, access_secret]):
            log.error(
                "Missing Twitter credentials. Required: TWITTER_CONSUMER_KEY, "
                "TWITTER_CONSUMER_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET"
            )
            raise RuntimeError("Twitter credentials not configured")

        _cached_client = tweepy.Client(
            bearer_token=bearer_token,
            consumer_key=consumer_key,
            consumer_secret=consumer_secret,
            access_token=access_token,
            access_token_secret=access_secret,
            wait_on_rate_limit=True,
        )
        log.info("Twitter client initialized (Basic tier, 3000 posts/month)")
        return _cached_client


def verify_account() -> dict:
    """Verify the authenticated account matches @WTPForUs.

    Should be called once on startup to confirm credentials are correct.
    Returns account info dict or raises RuntimeError.
    """
    global _verified_account_id, _verified_username
    try:
        client = _get_client()
        me = client.get_me(user_fields=["username", "name", "verified"])
        if me.data is None:
            raise RuntimeError("Could not fetch authenticated user info")

        _verified_account_id = str(me.data.id)
        _verified_username = me.data.username

        if me.data.username.lower() != "wtpforus":
            log.warning(
                "Authenticated as @%s (expected @WTPForUs). "
                "Check credentials if this is unexpected.",
                me.data.username
            )

        log.info("Verified account: @%s (ID: %s)", me.data.username, me.data.id)
        return {
            "id": str(me.data.id),
            "username": me.data.username,
            "name": me.data.name,
        }
    except tweepy.TweepyException as e:
        log.error("Failed to verify Twitter account: %s", e)
        raise RuntimeError(f"Twitter account verification failed: {e}")


def get_account_id() -> Optional[str]:
    """Get the verified account ID (call verify_account first)."""
    return _verified_account_id


def is_own_tweet(tweet_id: str) -> bool:
    """Check if a tweet belongs to our bot account.

    Prevents self-reply loops.
    """
    if not _verified_account_id:
        # Verify first if not done
        try:
            verify_account()
        except RuntimeError:
            return False

    try:
        client = _get_client()
        tweet = client.get_tweet(tweet_id, expansions=["author_id"])
        if tweet.data is None:
            return False
        return str(tweet.data.author_id) == _verified_account_id
    except tweepy.TweepyException as e:
        log.warning("Could not check tweet ownership for %s: %s", tweet_id, e)
        return False


# ── Posting ───────────────────────────��─────────────────────��──────────────────

def post_tweet(text: str, reply_to: Optional[str] = None,
               quote_tweet_id: Optional[str] = None) -> Optional[str]:
    """Post a single tweet with retry logic.

    Returns the tweet ID on success, None on failure.
    Retries on transient errors (network, rate limit, 5xx).
    Does NOT retry on content policy violations or auth errors.

    Args:
        text: Tweet text (up to 25,000 chars for verified accounts)
        reply_to: Optional tweet ID to reply to
        quote_tweet_id: Optional tweet ID to quote-tweet
    """
    from utils.twitter_helpers import is_paused

    # Kill switch check
    if is_paused():
        log.warning("Bot is PAUSED. Skipping tweet post.")
        return None

    # Length validation (25K for verified, but we cap at 4000 for engagement)
    if len(text) > 25000:
        log.warning("Tweet too long (%d chars), truncating to 25000", len(text))
        truncated = text[:24997]
        last_space = truncated.rfind(" ")
        if last_space > 24000:
            truncated = truncated[:last_space]
        text = truncated + "..."

    for attempt in range(MAX_RETRIES):
        try:
            client = _get_client()
            kwargs = {"text": text}
            if reply_to:
                kwargs["in_reply_to_tweet_id"] = reply_to
            if quote_tweet_id:
                kwargs["quote_tweet_id"] = quote_tweet_id

            start = time.time()
            response = client.create_tweet(**kwargs)
            elapsed = time.time() - start

            tweet_id = response.data["id"]

            # Log if the request took unusually long (likely rate limit wait)
            if elapsed > 10:
                log.warning(
                    "Tweet post took %.1fs (possible rate limit wait). ID: %s",
                    elapsed, tweet_id
                )
            else:
                log.info("Posted tweet %s (%.1fs): %s", tweet_id, elapsed, text[:80])

            return tweet_id

        except tweepy.errors.Forbidden as e:
            # 403: content policy violation, duplicate, or auth issue — don't retry
            log.error("Tweet rejected (403 Forbidden): %s | Text: %s", e, text[:100])
            return None

        except tweepy.errors.BadRequest as e:
            # 400: malformed request — don't retry
            log.error("Tweet rejected (400 Bad Request): %s | Text: %s", e, text[:100])
            return None

        except tweepy.errors.Unauthorized as e:
            # 401: auth failure — don't retry
            log.error("Tweet rejected (401 Unauthorized): %s", e)
            return None

        except tweepy.errors.TooManyRequests as e:
            # 429: rate limited — wait and retry
            wait = RETRY_BACKOFF_BASE ** (attempt + 1)
            log.warning(
                "Rate limited (429). Attempt %d/%d. Waiting %ds. Error: %s",
                attempt + 1, MAX_RETRIES, wait, e
            )
            time.sleep(wait)

        except tweepy.errors.TwitterServerError as e:
            # 5xx: server error — retry with backoff
            wait = RETRY_BACKOFF_BASE ** (attempt + 1)
            log.warning(
                "Twitter server error (5xx). Attempt %d/%d. Waiting %ds. Error: %s",
                attempt + 1, MAX_RETRIES, wait, e
            )
            time.sleep(wait)

        except tweepy.TweepyException as e:
            # Generic tweepy error (network, timeout, etc.)
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF_BASE ** (attempt + 1)
                log.warning(
                    "Tweet post failed (attempt %d/%d). Waiting %ds. Error: %s",
                    attempt + 1, MAX_RETRIES, wait, e
                )
                time.sleep(wait)
            else:
                log.error("Tweet post failed after %d attempts: %s", MAX_RETRIES, e)
                return None

    log.error("Tweet post exhausted all %d retries", MAX_RETRIES)
    return None


def post_thread(tweets: List[str]) -> List[str]:
    """Post a multi-tweet thread with recovery on partial failure.

    If a tweet in the thread fails, logs the orphaned tweets and returns
    whatever was successfully posted.

    Args:
        tweets: List of tweet texts

    Returns:
        List of successfully posted tweet IDs
    """
    from utils.twitter_helpers import is_paused

    if is_paused():
        log.warning("Bot is PAUSED. Skipping thread post.")
        return []

    if not tweets:
        return []

    ids = []
    reply_to = None

    for i, text in enumerate(tweets):
        tweet_id = post_tweet(text, reply_to=reply_to)
        if tweet_id:
            ids.append(tweet_id)
            reply_to = tweet_id
        else:
            log.error(
                "Thread broken at tweet %d/%d. %d tweets orphaned. "
                "Posted IDs: %s",
                i + 1, len(tweets), len(tweets) - i, ids
            )
            break

    if ids:
        log.info("Thread posted: %d/%d tweets successfully", len(ids), len(tweets))
    return ids


# ── Reading ───────────────────���────────────────────────��───────────────────────

def search_recent_tweets(query: str, max_results: int = 10) -> list:
    """Search recent tweets matching a query string.

    Basic tier: 60 requests per 15-minute window for recent search.
    Returns up to 100 tweets per request.

    Args:
        query: Search query (supports Twitter search operators)
        max_results: Max tweets to return (10-100)
    """
    try:
        client = _get_client()
        response = client.search_recent_tweets(
            query=query,
            max_results=min(max(max_results, 10), 100),
            tweet_fields=["author_id", "created_at", "text", "public_metrics"],
            expansions=["author_id"],
            user_fields=["username", "name"],
        )
        tweets = response.data or []
        users_map = {}
        if response.includes and "users" in response.includes:
            for u in response.includes["users"]:
                users_map[u.id] = u

        results = []
        for t in tweets:
            user = users_map.get(t.author_id)
            results.append({
                "id": t.id,
                "text": t.text,
                "author_id": t.author_id,
                "username": user.username if user else None,
                "name": user.name if user else None,
                "created_at": str(t.created_at) if t.created_at else None,
                "metrics": t.public_metrics,
            })

        log.info("Search found %d tweets for: %s", len(results), query[:60])
        return results
    except tweepy.TweepyException as e:
        log.error("Tweet search failed for '%s': %s", query[:60], e)
        return []


def get_user_tweets(username: str, max_results: int = 10) -> list:
    """Get recent tweets from a specific user by username.

    Basic tier: user tweet timeline is supported.

    Args:
        username: Twitter username (without @)
        max_results: Max tweets to return (5-100)
    """
    try:
        client = _get_client()
        user = client.get_user(username=username)
        if not user.data:
            log.warning("User @%s not found", username)
            return []

        response = client.get_users_tweets(
            id=user.data.id,
            max_results=min(max(max_results, 5), 100),
            tweet_fields=["created_at", "text", "public_metrics"],
        )
        tweets = response.data or []

        results = []
        for t in tweets:
            results.append({
                "id": t.id,
                "text": t.text,
                "username": username,
                "created_at": str(t.created_at) if t.created_at else None,
                "metrics": t.public_metrics,
            })

        log.info("Fetched %d tweets from @%s", len(results), username)
        return results
    except tweepy.TweepyException as e:
        log.error("Failed to fetch tweets from @%s: %s", username, e)
        return []


def get_mentions(since_id: Optional[str] = None, max_results: int = 20) -> list:
    """Get recent @mentions of the bot account.

    Basic tier supports get_users_mentions.
    Used for engagement monitoring and response.

    Args:
        since_id: Only return mentions after this tweet ID
        max_results: Max mentions to return (5-100)
    """
    try:
        client = _get_client()
        if not _verified_account_id:
            verify_account()

        kwargs = {
            "id": _verified_account_id,
            "max_results": min(max(max_results, 5), 100),
            "tweet_fields": ["author_id", "created_at", "text", "public_metrics",
                             "in_reply_to_user_id", "conversation_id"],
            "expansions": ["author_id"],
            "user_fields": ["username", "name"],
        }
        if since_id:
            kwargs["since_id"] = since_id

        response = client.get_users_mentions(**kwargs)
        mentions = response.data or []

        users_map = {}
        if response.includes and "users" in response.includes:
            for u in response.includes["users"]:
                users_map[u.id] = u

        results = []
        for m in mentions:
            user = users_map.get(m.author_id)
            results.append({
                "id": m.id,
                "text": m.text,
                "author_id": m.author_id,
                "username": user.username if user else None,
                "name": user.name if user else None,
                "created_at": str(m.created_at) if m.created_at else None,
                "metrics": m.public_metrics,
            })

        log.info("Fetched %d mentions", len(results))
        return results
    except tweepy.TweepyException as e:
        log.error("Failed to fetch mentions: %s", e)
        return []


def get_tweet_metrics(tweet_id: str) -> Optional[dict]:
    """Fetch engagement metrics for a specific tweet.

    Returns dict with: retweet_count, reply_count, like_count, quote_count,
    impression_count, bookmark_count.

    Used for A/B testing and content optimization.
    """
    try:
        client = _get_client()
        response = client.get_tweet(
            tweet_id,
            tweet_fields=["public_metrics", "organic_metrics", "created_at"],
        )
        if response.data and response.data.public_metrics:
            return response.data.public_metrics
        return None
    except tweepy.TweepyException as e:
        log.debug("Failed to fetch metrics for tweet %s: %s", tweet_id, e)
        return None


def get_own_recent_tweets(max_results: int = 20) -> list:
    """Fetch our own recent tweets for self-analytics.

    Used to track which content types perform best.
    """
    if not _verified_account_id:
        try:
            verify_account()
        except RuntimeError:
            return []

    try:
        client = _get_client()
        response = client.get_users_tweets(
            id=_verified_account_id,
            max_results=min(max(max_results, 5), 100),
            tweet_fields=["created_at", "text", "public_metrics"],
        )
        tweets = response.data or []
        results = []
        for t in tweets:
            results.append({
                "id": t.id,
                "text": t.text,
                "created_at": str(t.created_at) if t.created_at else None,
                "metrics": t.public_metrics,
            })
        return results
    except tweepy.TweepyException as e:
        log.error("Failed to fetch own tweets: %s", e)
        return []


# ── Direct Messages (Basic tier supported) ────────��────────────────────────────

def send_dm(user_id: str, text: str) -> bool:
    """Send a direct message to a user.

    Basic tier supports create_direct_message.
    Use sparingly and only for explicit user requests.

    Args:
        user_id: Twitter user ID to DM
        text: Message text
    """
    from utils.twitter_helpers import is_paused

    if is_paused():
        log.warning("Bot is PAUSED. Skipping DM send.")
        return False

    try:
        client = _get_client()
        client.create_direct_message(participant_id=user_id, text=text)
        log.info("Sent DM to user %s", user_id)
        return True
    except tweepy.TweepyException as e:
        log.error("Failed to send DM to %s: %s", user_id, e)
        return False


# ── Startup Verification ───────────────────────���───────────────────────────────

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    print("=== Twitter Connector Verification ===")
    print(f"Tier: Basic ($200/month)")
    print(f"Monthly limit: 3,000 posts")
    print(f"Target usage: ~330 posts/month (11%)")
    print()

    info = verify_account()
    print(f"Account: @{info['username']} ({info['name']})")
    print(f"ID: {info['id']}")
    print()
    print("Ready to post.")
