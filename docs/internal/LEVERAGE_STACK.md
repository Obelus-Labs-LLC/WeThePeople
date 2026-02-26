# Leverage Stack - Quick Reference

## Overview

Minimal infrastructure for building a resilient two-rail accountability system.

**Stack:**
- `python-dotenv` - Environment variable management
- `typer` + `rich` - Modern CLI with beautiful output
- `tenacity` - Retry policies for HTTP
- `pydantic` - Type-safe API response validation
- `diskcache` - Disk-based HTTP response caching

## Installation

```bash
pip install -r requirements.txt
```

## Configuration

Environment variables loaded from `.env`:

```env
# Congress.gov API (required for ground truth)
CONGRESS_API_KEY=your_key_here

# Optional overrides
HTTP_TIMEOUT=30
HTTP_MAX_RETRIES=3
CACHE_ENABLED=true
CACHE_TTL=86400
```

## CLI Commands

### Health Check
```bash
python -m cli health
```

Verifies:
- ✅ Configuration valid
- ✅ Database connected
- ✅ Congress.gov API key works
- ℹ️ Cache statistics

### Ground Truth Operations

**Sync all pilot members:**
```bash
python -m cli groundtruth sync --all-active --congress 119
```

**Sync specific member:**
```bash
python -m cli groundtruth sync --person-id alexandria_ocasio_cortez --congress 119
python -m cli groundtruth sync --bioguide O000172 --congress 119
```

**View statistics:**
```bash
python -m cli groundtruth stats
```

## Core Modules

### `utils/config.py`
Single source of truth for configuration:
```python
from utils.config import config

# Access settings
api_key = config.CONGRESS_API_KEY
timeout = config.HTTP_TIMEOUT
```

### `utils/http_client.py`
Resilient HTTP client with retries and caching:
```python
from utils.http_client import http_client

# Congress.gov API call (auto-retries 429/503)
data = http_client.get_congress_api(
    "member/O000172/sponsored-legislation",
    params={"congress": 119, "limit": 250}
)

# Cache stats
stats = http_client.cache_stats()
http_client.clear_cache()
```

### `utils/models.py`
Type-safe Pydantic models:
```python
from utils.models import SponsoredLegislationResponse, CongressBillItem

# Parse API response
response = SponsoredLegislationResponse(**data)

# Work with type-safe objects
for item in response.sponsoredLegislation:
    if item.is_bill():
        bill_id = item.to_bill_id()  # "hr1234-119"
```

## HTTP Client Features

### Automatic Retries
- **429 (Rate Limit)**: Exponential backoff, retry
- **503 (Server Error)**: Exponential backoff, retry
- **Timeout/Connection**: Exponential backoff, retry
- **401/403 (Auth)**: Fail fast, no retry

### Disk Caching
- Keyed by URL + params (MD5 hash)
- Default TTL: 24 hours
- Bypass: `use_cache=False`
- Clear: `http_client.clear_cache()`

### Example
```python
# First call: hits API, caches response
data = http_client.get_congress_api("member/O000172/sponsored-legislation", 
                                     params={"congress": 119, "limit": 1})

# Second call: instant (from cache)
data = http_client.get_congress_api("member/O000172/sponsored-legislation",
                                     params={"congress": 119, "limit": 1})

# Force fresh: bypass cache
data = http_client.get_congress_api("member/O000172/sponsored-legislation",
                                     params={"congress": 119, "limit": 1},
                                     use_cache=False)
```

## Migration Path

### Old Scripts (Still Work)
```bash
python jobs/sync_member_groundtruth.py --bioguide O000172 --congress 119
```

### New CLI (Recommended)
```bash
python -m cli groundtruth sync --bioguide O000172 --congress 119
```

### New Programmatic (jobs/sync_groundtruth_v2.py)
```python
from jobs.sync_groundtruth_v2 import sync_groundtruth_v2

sync_groundtruth_v2(
    bioguide_id="O000172",
    congress=119,
    use_cache=True,
    dry_run=False
)
```

## Benefits

### Developer Experience
- **Rich output**: Spinners, progress bars, tables
- **Type safety**: Pydantic catches API schema changes
- **Faster iteration**: Disk cache speeds up dev/testing
- **Clear errors**: Structured error handling

### Reliability
- **Automatic retries**: Handles transient failures
- **Rate limiting**: Respects API limits
- **Fail fast**: Auth errors don't retry
- **Validation**: Catches bad API responses early

### Operations
- **Health checks**: `python -m cli health` verifies config
- **Cache control**: View stats, clear cache
- **Consistent flags**: `--dry-run`, `--all-active` everywhere
- **Structured logging**: Rich console output

## File Structure

```
├── cli/
│   ├── __main__.py           # CLI entry point
│   ├── health_cmd.py          # Health check command
│   └── groundtruth_cmd.py     # Ground truth operations
├── utils/
│   ├── config.py              # Configuration management
│   ├── http_client.py         # HTTP wrapper with retries
│   └── models.py              # Pydantic API models
├── jobs/
│   ├── sync_member_groundtruth.py  # Original (still works)
│   └── sync_groundtruth_v2.py      # Modern version
└── requirements.txt           # Dependencies
```

## Testing

**Run health check:**
```bash
python -m cli health
```

**Test sync (dry run):**
```python
from jobs.sync_groundtruth_v2 import sync_groundtruth_v2
sync_groundtruth_v2('O000172', 119, dry_run=True)
```

**Verify gate:**
```bash
.\scripts\run_gate.ps1
```

## Next Steps

1. Migrate remaining jobs to use `http_client`
2. Add CLI commands for other operations (ingest claims, recompute, etc.)
3. Add structured logging (replace prints with rich.console)
4. Add metrics collection (track API calls, cache hit rate)

## Design Principles

✅ **Minimal** - Only essential tools
✅ **Incremental** - Old code still works
✅ **Type-safe** - Pydantic validation
✅ **Resilient** - Automatic retries
✅ **Fast** - Disk caching
✅ **Clear** - Rich output
