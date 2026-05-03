"""Smoke tests for the new backfill connectors and jobs.

These tests don't hit any live external service. Each external HTTP
call is mocked at the `requests` boundary so the tests run offline,
deterministically, and in <1 second.

What we're guarding against:
  - A schema change at Treasury OFAC, OpenSanctions, Wikidata,
    Wikipedia, or Stooq quietly breaking a daily cron.
  - A logic regression in the matching/dedup/parse code that would
    silently flag the wrong entities or skip valid ones.
  - A shape regression in `fetch_overview()` returning rows the
    `stock_fundamentals` schema can't accept.

We only test the pure parsing/matching/normalization logic — not the
DB writes or scheduler integration. Those are exercised by the live
runs and would need a sqlite fixture which is out of scope here.
"""

from __future__ import annotations

# Path setup MUST come before any project imports — pytest's auto-rootdir
# adds `tests/` to sys.path but not the project root, so `import jobs.X`
# would fail without this.
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import io
from unittest.mock import patch, MagicMock

import pytest


# ─── connectors/yahoo_finance.py ────────────────────────────────────────────


class TestYahooFinanceConnector:
    """Stooq-CSV parsing + Finnhub mapping + composed fetch_overview shape."""

    def test_stooq_quote_parses_ohlcv_csv(self):
        """The Stooq endpoint returns a single CSV row. We require
        Symbol/Date/OHLC/Volume to come back as floats."""
        from connectors.yahoo_finance import fetch_stooq_quote

        csv_payload = (
            "Symbol,Date,Time,Open,High,Low,Close,Volume\n"
            "AAPL.US,2026-05-01,22:00:00,278.85,287.22,278.37,280.14,79915442\n"
        )
        mock_resp = MagicMock(status_code=200, text=csv_payload)
        with patch("connectors.yahoo_finance.requests.get", return_value=mock_resp):
            row = fetch_stooq_quote("AAPL")

        assert row is not None
        assert row["price"] == 280.14
        assert row["high"] == 287.22
        assert row["low"] == 278.37
        assert row["latest_trading_day"] == "2026-05-01"

    def test_stooq_returns_none_for_unknown_ticker(self):
        """Stooq returns 'N/D' on every column for unknown tickers.
        Connector must treat that as a miss, not a partial row."""
        from connectors.yahoo_finance import fetch_stooq_quote

        nd_csv = (
            "Symbol,Date,Time,Open,High,Low,Close,Volume\n"
            "ZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n"
        )
        mock_resp = MagicMock(status_code=200, text=nd_csv)
        with patch("connectors.yahoo_finance.requests.get", return_value=mock_resp):
            assert fetch_stooq_quote("ZZZZ") is None

    def test_finnhub_skipped_without_api_key(self, monkeypatch):
        """Without `FINNHUB_API_KEY` we must not even attempt the
        request — keeps the network quiet for the 95% of tickers
        yfinance handles."""
        monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
        from connectors.yahoo_finance import fetch_finnhub

        with patch("connectors.yahoo_finance.requests.get") as mock_get:
            assert fetch_finnhub("PBR") is None
            mock_get.assert_not_called()

    def test_finnhub_marketcap_converted_from_millions(self, monkeypatch):
        """Finnhub returns market cap in millions of USD; we store it
        in raw dollars. Check the multiplication is applied."""
        monkeypatch.setenv("FINNHUB_API_KEY", "test-key")
        from connectors.yahoo_finance import fetch_finnhub

        profile = MagicMock(
            status_code=200,
            json=MagicMock(return_value={
                "ticker": "PBR",
                "name": "Petroleo Brasileiro S.A.",
                "marketCapitalization": 90_000,  # 90,000 million = $90B
                "finnhubIndustry": "Energy",
            }),
        )
        quote = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"c": 14.50, "h": 14.75, "l": 14.30}),
        )
        with patch("connectors.yahoo_finance.requests.get", side_effect=[profile, quote]):
            result = fetch_finnhub("PBR")

        assert result is not None
        assert result["marketCap"] == 90_000_000_000  # 90B in raw dollars
        assert result["regularMarketPrice"] == 14.50
        assert result["sector"] == "Energy"


# ─── jobs/backfill_sanctions_status.py ──────────────────────────────────────


class TestSanctionsBackfill:
    """OFAC SDN parser + foreign-program filter + name normalization."""

    def test_normalize_strips_legal_suffixes(self):
        from jobs.backfill_sanctions_status import _normalize

        # The whole point of normalization is matching variants
        # against the same canonical key.
        assert _normalize("JPMorgan Chase & Co.") == _normalize("JPMORGAN CHASE & CO")
        assert _normalize("Apple Inc.") == _normalize("APPLE INC")
        # Holdings/Group/Corporation all collapse
        assert _normalize("Stanley Black & Decker, Inc.") == _normalize("Stanley Black Decker Corporation")

    def test_foreign_program_filter_drops_russia_only(self):
        """Triumph Group regression — a Russian-targeted SDN row
        must NOT match a US-listed company by name. The filter
        accepts only programs that legitimately target US persons."""
        from jobs.backfill_sanctions_status import _is_foreign_targeted

        # Foreign-only program list — should be filtered out
        assert _is_foreign_targeted("UKRAINE-EO13662] [RUSSIA-EO14024") is True
        assert _is_foreign_targeted("RUSSIA-EO14024") is True
        assert _is_foreign_targeted("IRAN") is True
        assert _is_foreign_targeted("CUBA") is True

        # US-targeting programs — must NOT be filtered
        assert _is_foreign_targeted("SDGT") is False  # counter-terrorism
        assert _is_foreign_targeted("MAGNIT") is False  # Global Magnitsky
        assert _is_foreign_targeted("SDNTK") is False  # narcotics

        # Mixed (foreign + US-targeting) — keep, because the US program
        # might legitimately apply
        assert _is_foreign_targeted("RUSSIA-EO14024] [SDGT") is False

    def test_sdn_csv_parser_handles_unknown_columns(self):
        """OFAC's CSV occasionally adds new columns at the tail.
        Our parser keys off positional indexes 0-3 (ent_num, name,
        type, program) and must gracefully skip rows with fewer."""
        from jobs.backfill_sanctions_status import _parse_sdn_index

        csv_bytes = (
            b'1,"ACME CORP",entity,"SDGT","extra1","extra2"\n'
            b'2,"BAD ROW"\n'  # too short — should skip, not crash
            b'3,"FOREIGN CO LTD",entity,"RUSSIA-EO14024"\n'  # filtered out
        )
        index = _parse_sdn_index(csv_bytes)
        # ACME made it in; FOREIGN dropped (Russia-only program); short row skipped
        assert "acme" in index
        assert "foreign" not in index


# ─── jobs/backfill_logos_wikidata.py ────────────────────────────────────────


class TestWikidataLogos:
    """Wikidata search + P154 parsing + Commons URL building."""

    def test_commons_url_handles_spaces_and_unicode(self):
        from jobs.backfill_logos_wikidata import _commons_url

        # Spaces -> underscores, URL-encoded
        url = _commons_url("Apple Inc Logo.svg")
        assert "Apple_Inc_Logo.svg" in url
        assert url.endswith("?width=300")
        # Unicode characters get percent-encoded
        url2 = _commons_url("Citroën_logo.svg")
        assert "Citro" in url2 and "%" in url2  # %C3%ABn

    def test_search_entities_returns_qids(self):
        """Wikidata wbsearchentities returns a list of dicts with `id`
        as the Q-ID. Connector must extract them."""
        from jobs.backfill_logos_wikidata import _search_entities

        mock_resp = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"search": [
                {"id": "Q312", "label": "Apple Inc."},
                {"id": "Q9678", "label": "Apple Records"},
            ]}),
        )
        with patch("jobs.backfill_logos_wikidata.requests.get", return_value=mock_resp):
            qids = _search_entities("Apple Inc")

        assert qids == ["Q312", "Q9678"]


# ─── jobs/backfill_logos_wikipedia.py ───────────────────────────────────────


class TestWikipediaLogos:
    """Wikipedia media-list filename filter."""

    def test_filename_filter_accepts_only_logo_files(self):
        from jobs.backfill_logos_wikipedia import _is_logo_candidate

        # Real logo files — accept
        assert _is_logo_candidate("Apple_Logo.svg") is True
        assert _is_logo_candidate("Bunge_Limited_Logo.svg") is True
        assert _is_logo_candidate("CPKC_Wordmark.svg") is True

        # HQ photos / storefronts — reject
        assert _is_logo_candidate("Apple_Park_Cupertino.jpg") is False
        assert _is_logo_candidate("Tractor_Supply_Storefront.jpg") is False
        assert _is_logo_candidate("Comcast_Building_Philly.jpg") is False

        # Wrong file type — reject
        assert _is_logo_candidate("Apple_Logo.pdf") is False
        assert _is_logo_candidate("Apple_Logo.gif") is False

    def test_normalize_title_strips_legal_suffix(self):
        from jobs.backfill_logos_wikipedia import _normalize_title

        # Wikipedia titles usually omit the legal entity suffix
        assert _normalize_title("Bunge Limited") in ("Bunge", "Bunge Limited")
        assert _normalize_title("Apple Inc.").startswith("Apple")
        # Parenthetical disambiguators stripped (won't include "(Petrobras)")
        normalized = _normalize_title("Petroleo Brasileiro S.A. (Petrobras)")
        assert "Petroleo Brasileiro" in normalized
        assert "Petrobras" not in normalized
        assert "(" not in normalized


# ─── jobs/backfill_sanctions_global.py ──────────────────────────────────────


class TestGlobalSanctions:
    """OpenSanctions list-family classification + ESMA filter."""

    def test_real_sanctions_filter_rejects_esma(self):
        """ESMA stock-delistings flagged 6 false positives in the
        2026-05-03 audit. Filter must drop any row whose dataset
        list ONLY references regulatory enforcement, not real
        political sanctions."""
        from jobs.backfill_sanctions_global import _is_real_sanctions_list

        # Real political sanctions — keep
        assert _is_real_sanctions_list("US OFAC Specially Designated Nationals") is True
        assert _is_real_sanctions_list("EU CFSP Consolidated List") is True
        assert _is_real_sanctions_list("UK OFSI Consolidated List") is True
        assert _is_real_sanctions_list("UN Security Council Sanctions") is True

        # Regulatory only — drop
        assert _is_real_sanctions_list("EU ESMA Suspensions and Removals") is False
        assert _is_real_sanctions_list("FCA Enforcement Decisions") is False
        assert _is_real_sanctions_list("World Bank Debarments") is False

        # Mixed (regulatory + real) — keep
        assert _is_real_sanctions_list("EU ESMA Suspensions; UK OFSI") is True

    def test_list_kind_classifier(self):
        from jobs.backfill_sanctions_global import _list_kind

        assert _list_kind("US OFAC SDN", "") == "us"
        assert _list_kind("UK OFSI Consolidated", "") == "uk"
        assert _list_kind("EU CFSP", "") == "eu"
        assert _list_kind("UN Security Council", "") == "un"
        assert _list_kind("Some unrelated dataset", "") == "other"
