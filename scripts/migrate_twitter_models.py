"""
One-time migration: Add engagement metrics columns to tweet_log,
add reviewed_at/score to draft_replies, and create tweet_performance table.

Run on production:
    source .venv/bin/activate && python scripts/migrate_twitter_models.py

Safe to re-run — all ALTER TABLE uses IF NOT EXISTS pattern (try/except).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text, inspect
from models.database import engine, Base
from models.twitter_models import TweetLog, DraftReply, TweetPerformance


def column_exists(inspector, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    try:
        columns = [c["name"] for c in inspector.get_columns(table_name)]
        return column_name in columns
    except Exception:
        return False


def table_exists(inspector, table_name: str) -> bool:
    """Check if a table exists."""
    return table_name in inspector.get_table_names()


def migrate():
    inspector = inspect(engine)

    with engine.connect() as conn:
        # ── tweet_log: add engagement metrics columns ──────────────────
        tweet_log_columns = [
            ("impressions", "INTEGER"),
            ("likes", "INTEGER"),
            ("retweets", "INTEGER"),
            ("replies", "INTEGER"),
            ("quotes", "INTEGER"),
            ("bookmarks", "INTEGER"),
            ("engagement_score", "REAL"),
            ("metrics_updated_at", "DATETIME"),
        ]

        if table_exists(inspector, "tweet_log"):
            for col_name, col_type in tweet_log_columns:
                if not column_exists(inspector, "tweet_log", col_name):
                    conn.execute(text(
                        f"ALTER TABLE tweet_log ADD COLUMN {col_name} {col_type}"
                    ))
                    print(f"  Added tweet_log.{col_name} ({col_type})")
                else:
                    print(f"  tweet_log.{col_name} already exists")

            # Add index on category if not exists
            try:
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_tweet_log_category ON tweet_log (category)"
                ))
                print("  Created index ix_tweet_log_category")
            except Exception:
                print("  Index ix_tweet_log_category already exists")

            # Add index on tweet_id if not exists
            try:
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_tweet_log_tweet_id ON tweet_log (tweet_id)"
                ))
                print("  Created index ix_tweet_log_tweet_id")
            except Exception:
                print("  Index ix_tweet_log_tweet_id already exists")

        # ── draft_replies: add score and reviewed_at columns ───────────
        draft_reply_columns = [
            ("score", "REAL"),
            ("reviewed_at", "DATETIME"),
        ]

        if table_exists(inspector, "draft_replies"):
            for col_name, col_type in draft_reply_columns:
                if not column_exists(inspector, "draft_replies", col_name):
                    conn.execute(text(
                        f"ALTER TABLE draft_replies ADD COLUMN {col_name} {col_type}"
                    ))
                    print(f"  Added draft_replies.{col_name} ({col_type})")
                else:
                    print(f"  draft_replies.{col_name} already exists")

            # Add index on target_tweet_id
            try:
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_draft_replies_target_tweet_id "
                    "ON draft_replies (target_tweet_id)"
                ))
                print("  Created index ix_draft_replies_target_tweet_id")
            except Exception:
                print("  Index ix_draft_replies_target_tweet_id already exists")
        else:
            print("  Creating draft_replies table...")
            DraftReply.__table__.create(engine, checkfirst=True)
            print("  Created draft_replies table")

        # ── tweet_performance: create table ────────────────────────────
        if not table_exists(inspector, "tweet_performance"):
            print("  Creating tweet_performance table...")
            TweetPerformance.__table__.create(engine, checkfirst=True)
            print("  Created tweet_performance table")
        else:
            print("  tweet_performance table already exists")

        conn.commit()
        print("\nMigration complete.")


if __name__ == "__main__":
    print("=== Twitter Models Migration ===\n")
    migrate()
