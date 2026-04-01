"""
Twitter/X Connector — Post tweets, threads, and DMs via X API v2.

Uses OAuth 1.0a User Context (Access Token + Secret) for posting.
Uses Bearer Token for read-only operations.

Auth: Requires TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_SECRET for posting.
Rate limit: 500 posts/month on free tier (~17/day max, we target 4/day).
"""

import os
import tweepy
from typing import List, Optional

from utils.logging import get_logger

logger = get_logger(__name__)

# Module-level cached client (lazy initialization via _get_client())
_cached_client: Optional[tweepy.Client] = None


def _get_client() -> tweepy.Client:
    """Get authenticated tweepy Client for posting (OAuth 1.0a User Context).

    Caches the client at module level to avoid creating a new instance per call.
    NOTE: wait_on_rate_limit=True means the client will block (up to ~15 min)
    if a rate limit is hit, rather than raising an error immediately.
    """
    global _cached_client
    if _cached_client is not None:
        return _cached_client
    _cached_client = tweepy.Client(
        bearer_token=os.getenv("TWITTER_BEARER_TOKEN"),
        consumer_key=os.getenv("TWITTER_CONSUMER_KEY"),
        consumer_secret=os.getenv("TWITTER_CONSUMER_SECRET"),
        access_token=os.getenv("TWITTER_ACCESS_TOKEN"),
        access_token_secret=os.getenv("TWITTER_ACCESS_SECRET"),
        wait_on_rate_limit=True,
    )
    return _cached_client


def post_tweet(text: str, reply_to: Optional[str] = None, quote_tweet_id: Optional[str] = None) -> Optional[str]:
    """
    Post a single tweet. Returns the tweet ID on success, None on failure.

    Args:
        text: Tweet text (max 280 chars)
        reply_to: Optional tweet ID to reply to
        quote_tweet_id: Optional tweet ID to quote-tweet
    """
    if len(text) > 280:
        logger.warning("Tweet too long (%d chars), truncating", len(text))
        # Truncate at last space before 277 chars to avoid cutting mid-word
        truncated = text[:277]
        last_space = truncated.rfind(" ")
        if last_space > 200:  # Only use word boundary if it doesn't lose too much
            truncated = truncated[:last_space]
        text = truncated + "..."

    try:
        client = _get_client()
        kwargs = {"text": text}
        if reply_to:
            kwargs["in_reply_to_tweet_id"] = reply_to
        if quote_tweet_id:
            kwargs["quote_tweet_id"] = quote_tweet_id

        response = client.create_tweet(**kwargs)
        tweet_id = response.data["id"]
        logger.info("Posted tweet %s: %s", tweet_id, text[:60])
        return tweet_id
    except tweepy.TweepyException as e:
        logger.error("Failed to post tweet: %s", e)
        return None


def post_thread(tweets: List[str]) -> List[str]:
    """
    Post a multi-tweet thread. Returns list of tweet IDs.

    Args:
        tweets: List of tweet texts (each max 280 chars)
    """
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
            logger.error("Thread broken at tweet %d/%d", i + 1, len(tweets))
            break

    logger.info("Posted thread: %d/%d tweets", len(ids), len(tweets))
    return ids


def search_recent_tweets(query: str, max_results: int = 10) -> list:
    """
    Search recent tweets matching a query string.

    Uses Twitter API v2 search_recent_tweets endpoint.
    Free tier supports recent search with limited volume.

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
        # Attach user info to tweets
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

        logger.info("Search found %d tweets for query: %s", len(results), query[:50])
        return results
    except tweepy.TweepyException as e:
        logger.error("Failed to search tweets: %s", e)
        return []


def get_user_tweets(username: str, max_results: int = 10) -> list:
    """
    Get recent tweets from a specific user by username.

    Args:
        username: Twitter username (without @)
        max_results: Max tweets to return (5-100)
    """
    try:
        client = _get_client()
        user = client.get_user(username=username)
        if not user.data:
            logger.warning("User @%s not found", username)
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

        logger.info("Fetched %d tweets from @%s", len(results), username)
        return results
    except tweepy.TweepyException as e:
        logger.error("Failed to fetch tweets from @%s: %s", username, e)
        return []


def get_mentions(since_id: Optional[str] = None, max_results: int = 20) -> list:
    """
    Get recent @mentions of the bot account.

    NOTE: Requires Basic tier ($100/month). Free tier does not support
    get_users_mentions. This function will work when/if we upgrade.

    Args:
        since_id: Only return mentions after this tweet ID
        max_results: Max mentions to return (5-100)
    """
    try:
        client = _get_client()
        me = client.get_me().data
        kwargs = {"id": me.id, "max_results": max_results}
        if since_id:
            kwargs["since_id"] = since_id

        response = client.get_users_mentions(**kwargs)
        mentions = response.data or []
        logger.info("Fetched %d mentions", len(mentions))
        return mentions
    except tweepy.TweepyException as e:
        logger.error("Failed to fetch mentions: %s", e)
        return []


def send_dm(user_id: str, text: str) -> bool:
    """
    Send a direct message to a user.

    NOTE: Requires Basic tier ($100/month). Free tier does not support
    create_direct_message. This function will work when/if we upgrade.

    Args:
        user_id: Twitter user ID to DM
        text: Message text
    """
    try:
        client = _get_client()
        client.create_direct_message(participant_id=user_id, text=text)
        logger.info("Sent DM to user %s", user_id)
        return True
    except tweepy.TweepyException as e:
        logger.error("Failed to send DM to %s: %s", user_id, e)
        return False


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    print("=== Testing Twitter Connector ===")
    client = _get_client()
    me = client.get_me()
    print(f"Authenticated as: @{me.data.username} (ID: {me.data.id})")
