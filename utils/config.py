"""
Configuration Management

Loads environment variables safely for dev (dotenv) and prod (real env).
Single source of truth for all configuration.
"""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load .env in development (safe to call multiple times)
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file)


class Config:
    """Application configuration loaded from environment variables."""
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./wethepeople.db")
    
    # Congress.gov API
    CONGRESS_API_KEY: Optional[str] = os.getenv("CONGRESS_API_KEY") or os.getenv("API_KEY_CONGRESS")
    CONGRESS_API_BASE: str = "https://api.congress.gov/v3"
    
    # OpenStates API
    OPENSTATES_API_KEY: Optional[str] = os.getenv("OPENSTATES_API_KEY") or os.getenv("API_KEY_OPENSTATES")

    # GovInfo API (GPO) — uses data.gov key
    GOVINFO_API_KEY: Optional[str] = os.getenv("API_KEY_DATA_GOV")
    GOVINFO_API_BASE: str = "https://api.govinfo.gov"

    # Internet Archive
    IA_S3_ACCESS: Optional[str] = os.getenv("API_KEY_INTERNET_ARCHIVE_S3_ACCESS")
    IA_S3_SECRET: Optional[str] = os.getenv("API_KEY_INTERNET_ARCHIVE_S3_SECRET")
    IA_BASE: str = "https://web.archive.org"

    # FEC — uses data.gov key
    FEC_API_KEY: Optional[str] = os.getenv("API_KEY_DATA_GOV")
    FEC_API_BASE: str = "https://api.open.fec.gov/v1"

    # Census
    CENSUS_API_KEY: Optional[str] = os.getenv("API_KEY_CENSUS")

    # data.gov (umbrella key for GovInfo, FEC, EPA, FDA, etc.)
    DATAGOV_API_KEY: Optional[str] = os.getenv("API_KEY_DATA_GOV")

    # Google Civic Information API
    GOOGLE_CIVIC_API_KEY: Optional[str] = os.getenv("API_KEY_GOOGLE_CIVIC")
    GOOGLE_CIVIC_API_BASE: str = "https://www.googleapis.com/civicinfo/v2"

    # Enigma
    ENIGMA_API_KEY: Optional[str] = os.getenv("API_KEY_ENIGMA")

    # HTTP client settings
    HTTP_TIMEOUT: int = int(os.getenv("HTTP_TIMEOUT", "30"))
    HTTP_MAX_RETRIES: int = int(os.getenv("HTTP_MAX_RETRIES", "3"))
    HTTP_RETRY_BACKOFF: float = float(os.getenv("HTTP_RETRY_BACKOFF", "2.0"))
    
    # Cache settings
    CACHE_DIR: Path = Path(os.getenv("CACHE_DIR", ".cache"))
    CACHE_TTL: int = int(os.getenv("CACHE_TTL", "86400"))  # 24 hours default
    CACHE_ENABLED: bool = os.getenv("CACHE_ENABLED", "true").lower() in ("true", "1", "yes")
    
    # Rate limiting
    RATE_LIMIT_DELAY: float = float(os.getenv("RATE_LIMIT_DELAY", "1.0"))
    
    @classmethod
    def validate(cls) -> list[str]:
        """
        Validate required configuration.
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        if not cls.CONGRESS_API_KEY:
            errors.append("Missing CONGRESS_API_KEY (required for ground truth sync)")
        
        return errors
    
    @classmethod
    def is_valid(cls) -> bool:
        """Check if configuration is valid."""
        return len(cls.validate()) == 0
    
    @classmethod
    def summary(cls) -> dict:
        """Get configuration summary (safe for logging - no secrets)."""
        return {
            "database": cls.DATABASE_URL,
            "congress_api": "configured" if cls.CONGRESS_API_KEY else "missing",
            "openstates_api": "configured" if cls.OPENSTATES_API_KEY else "missing",
            "govinfo_api": "configured" if cls.GOVINFO_API_KEY else "missing",
            "ia_s3": "configured" if cls.IA_S3_ACCESS else "missing",
            "fec_api": "configured" if cls.FEC_API_KEY else "missing",
            "census_api": "configured" if cls.CENSUS_API_KEY else "missing",
            "datagov_api": "configured" if cls.DATAGOV_API_KEY else "missing",
            "google_civic_api": "configured" if cls.GOOGLE_CIVIC_API_KEY else "missing",
            "enigma_api": "configured" if cls.ENIGMA_API_KEY else "missing",
            "http_timeout": cls.HTTP_TIMEOUT,
            "cache_enabled": cls.CACHE_ENABLED,
            "cache_ttl": cls.CACHE_TTL,
        }


# Global config instance
config = Config()
