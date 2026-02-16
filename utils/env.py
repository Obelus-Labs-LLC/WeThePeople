"""
Safe environment variable loader.
Loads .env first, then .env.local (which can override).
"""
import os
from dotenv import load_dotenv


def get_api_base_url():
    """Load API base URL from environment, with .env.local override."""
    # Load base .env first
    load_dotenv(".env")
    # Load .env.local second (overrides .env values)
    load_dotenv(".env.local", override=True)
    
    return os.getenv("API_BASE_URL", "http://127.0.0.1:8000")


def get_env_var(key, default=None):
    """Safely get any environment variable."""
    load_dotenv(".env")
    load_dotenv(".env.local", override=True)
    return os.getenv(key, default)
