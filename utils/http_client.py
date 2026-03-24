"""
HTTP Client Wrapper

Provides resilient HTTP client with:
- Timeouts
- Retry policy (429/503 retry, 401/403 fail fast)
- Disk caching (optional TTL)
- Congress.gov API integration
"""

import hashlib
import json
import time
from typing import Optional, Any
from pathlib import Path

import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    RetryError
)
from diskcache import Cache

import os


class _Config:
    """Minimal config replacement using environment variables."""
    HTTP_TIMEOUT = int(os.getenv("HTTP_TIMEOUT", "30"))
    HTTP_MAX_RETRIES = int(os.getenv("HTTP_MAX_RETRIES", "3"))
    CACHE_ENABLED = os.getenv("CACHE_ENABLED", "1") == "1"
    CACHE_TTL = int(os.getenv("CACHE_TTL", "3600"))
    CACHE_DIR = os.getenv("CACHE_DIR", ".cache/http")
    CONGRESS_API_KEY = os.getenv("CONGRESS_API_KEY", "")
    CONGRESS_API_BASE = "https://api.congress.gov/v3"
    GOVINFO_API_KEY = os.getenv("GOVINFO_API_KEY", "")
    GOVINFO_API_BASE = "https://api.govinfo.gov"
    FEC_API_KEY = os.getenv("FEC_API_KEY", "DEMO_KEY")
    FEC_API_BASE = "https://api.open.fec.gov/v1"
    DATAGOV_API_KEY = os.getenv("DATAGOV_API_KEY", "DEMO_KEY")


config = _Config()


class HTTPError(Exception):
    """HTTP request failed."""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(f"HTTP {status_code}: {message}")


class RateLimitError(HTTPError):
    """Rate limit exceeded (429)."""
    pass


class AuthError(HTTPError):
    """Authentication failed (401/403)."""
    pass


class ServerError(HTTPError):
    """Server error (503)."""
    pass


class HTTPClient:
    """
    Resilient HTTP client with retries and caching.
    """
    
    def __init__(
        self,
        timeout: int = None,
        max_retries: int = None,
        cache_enabled: bool = None,
        cache_dir: Path = None,
        cache_ttl: int = None
    ):
        self.timeout = timeout or config.HTTP_TIMEOUT
        self.max_retries = max_retries or config.HTTP_MAX_RETRIES
        self.cache_enabled = cache_enabled if cache_enabled is not None else config.CACHE_ENABLED
        self.cache_ttl = cache_ttl or config.CACHE_TTL
        
        # Initialize cache
        cache_path = cache_dir or config.CACHE_DIR
        cache_path.mkdir(exist_ok=True)
        self.cache = Cache(str(cache_path))
    
    def _make_cache_key(self, url: str, params: Optional[dict] = None) -> str:
        """Generate cache key from URL and params."""
        key_data = {"url": url, "params": params or {}}
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=1, max=10),
        retry=retry_if_exception_type((RateLimitError, ServerError, requests.exceptions.Timeout, requests.exceptions.ConnectionError)),
        reraise=True
    )
    def _request_with_retry(
        self,
        method: str,
        url: str,
        params: Optional[dict] = None,
        **kwargs
    ) -> requests.Response:
        """Make HTTP request with retry logic."""
        try:
            response = requests.request(
                method,
                url,
                params=params,
                timeout=self.timeout,
                **kwargs
            )
            
            # Handle specific status codes
            if response.status_code == 429:
                raise RateLimitError(429, "Rate limit exceeded")
            elif response.status_code in (401, 403):
                raise AuthError(response.status_code, "Authentication failed")
            elif response.status_code == 503:
                raise ServerError(503, "Service unavailable")
            elif response.status_code >= 400:
                raise HTTPError(response.status_code, response.text[:200])
            
            return response
            
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            raise  # Let tenacity retry these directly
    
    def get(
        self,
        url: str,
        params: Optional[dict] = None,
        use_cache: bool = True,
        **kwargs
    ) -> dict:
        """
        GET request with caching.
        
        Args:
            url: URL to request
            params: Query parameters
            use_cache: Whether to use cache (default True)
            **kwargs: Additional requests kwargs
        
        Returns:
            JSON response as dict
        
        Raises:
            HTTPError: On HTTP error
            AuthError: On authentication error (401/403)
            RateLimitError: On rate limit (429)
        """
        # Check cache first
        cache_key = self._make_cache_key(url, params)
        if use_cache and self.cache_enabled:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached
        
        # Make request
        response = self._request_with_retry("GET", url, params=params, **kwargs)
        data = response.json()
        
        # Store in cache
        if use_cache and self.cache_enabled:
            self.cache.set(cache_key, data, expire=self.cache_ttl)
        
        return data
    
    def get_congress_api(
        self,
        endpoint: str,
        params: Optional[dict] = None,
        use_cache: bool = True,
        api_key: Optional[str] = None
    ) -> dict:
        """
        GET request to Congress.gov API v3.
        
        Args:
            endpoint: API endpoint (e.g., "member/O000172/sponsored-legislation")
            params: Query parameters
            use_cache: Whether to use cache
            api_key: API key (uses config if not provided)
        
        Returns:
            JSON response as dict
        """
        key = api_key or config.CONGRESS_API_KEY
        if not key:
            raise AuthError(403, "Missing Congress.gov API key")
        
        url = f"{config.CONGRESS_API_BASE}/{endpoint}"
        params = params or {}
        params["api_key"] = key
        params.setdefault("format", "json")
        
        return self.get(url, params=params, use_cache=use_cache)
    
    def get_govinfo(
        self,
        endpoint: str,
        params: Optional[dict] = None,
        use_cache: bool = True
    ) -> dict:
        """
        GET request to GovInfo API (api.govinfo.gov).

        Uses data.gov API key as query parameter.

        Args:
            endpoint: API endpoint (e.g., "collections/CREC")
            params: Query parameters
            use_cache: Whether to use cache

        Returns:
            JSON response as dict
        """
        key = config.GOVINFO_API_KEY
        if not key:
            raise AuthError(403, "Missing GovInfo/data.gov API key")

        url = f"{config.GOVINFO_API_BASE}/{endpoint}"
        params = params or {}
        params["api_key"] = key

        return self.get(url, params=params, use_cache=use_cache)

    def get_fec(
        self,
        endpoint: str,
        params: Optional[dict] = None,
        use_cache: bool = True
    ) -> dict:
        """
        GET request to FEC API (api.open.fec.gov).

        Uses data.gov API key as query parameter.

        Args:
            endpoint: API endpoint (e.g., "candidates/")
            params: Query parameters
            use_cache: Whether to use cache

        Returns:
            JSON response as dict
        """
        key = config.FEC_API_KEY
        if not key:
            raise AuthError(403, "Missing FEC/data.gov API key")

        url = f"{config.FEC_API_BASE}/{endpoint}"
        params = params or {}
        params["api_key"] = key

        return self.get(url, params=params, use_cache=use_cache)

    def get_datagov(
        self,
        base_url: str,
        endpoint: str,
        params: Optional[dict] = None,
        use_cache: bool = True
    ) -> dict:
        """
        GET request to any data.gov-powered API.

        Generic helper for the 20+ federal agency APIs that accept
        the data.gov API key.

        Args:
            base_url: API base URL (e.g., "https://api.regulations.gov/v4")
            endpoint: API endpoint
            params: Query parameters
            use_cache: Whether to use cache

        Returns:
            JSON response as dict
        """
        key = config.DATAGOV_API_KEY
        if not key:
            raise AuthError(403, "Missing data.gov API key")

        url = f"{base_url}/{endpoint}" if endpoint else base_url
        params = params or {}
        params["api_key"] = key

        return self.get(url, params=params, use_cache=use_cache)

    def clear_cache(self):
        """Clear all cached responses."""
        self.cache.clear()
    
    def cache_stats(self) -> dict:
        """Get cache statistics."""
        return {
            "size": len(self.cache),
            "volume": self.cache.volume(),
        }


# Global HTTP client instance
http_client = HTTPClient()
