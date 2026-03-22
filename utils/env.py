"""
Safe environment variable loader.
Loads .env first, then .env.local (which can override).
"""
import os
from dotenv import load_dotenv

# Load dotenv once at module level instead of per-function call
load_dotenv(".env")
load_dotenv(".env.local", override=True)


def get_api_base_url():
    """Load API base URL from environment, with .env.local override."""
    return os.getenv("API_BASE_URL", "http://127.0.0.1:8006")


def get_env_var(key, default=None):
    """Safely get any environment variable."""
    return os.getenv(key, default)
