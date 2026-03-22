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


def _get_client() -> tweepy.Client:
    """Get authenticated tweepy Client for posting (OAuth 1.0a User Context)."""
    return tweepy.Client(
        bearer_token=os.getenv("TWITTER_BEARER_TOKEN"),
        consumer_key=os.getenv("TWITTER_CLIENT_ID"),
        consumer_secret=os.getenv("TWITTER_CLIENT_SECRET"),
        access_token=os.getenv("TWITTER_ACCESS_TOKEN"),
        access_token_secret=os.getenv("TWITTER_ACCESS_SECRET"),
        wait_on_rate_limit=True,
    )


def post_tweet(text: str, reply_to: Optional[str] = None) -> Optional[str]:
    """
    Post a single tweet. Returns the tweet ID on success, None on failure.

    Args:
        text: Tweet text (max 280 chars)
        reply_to: Optional tweet ID to reply to
    """
    if len(text) > 280:
        logger.warning("Tweet too long (%d chars), truncating", len(text))
        text = text[:277] + "..."

    try:
        client = _get_client()
        kwargs = {"text": text}
        if reply_to:
            kwargs["in_reply_to_tweet_id"] = reply_to

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


def get_mentions(since_id: Optional[str] = None, max_results: int = 20) -> list:
    """
    Get recent @mentions of the bot account.

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
