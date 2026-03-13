"""
Market/Stock Models — Cross-Sector

StockFundamentals table stores Alpha Vantage company overview snapshots
for both finance institutions and health companies.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Date,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from models.database import Base


class StockFundamentals(Base):
    """
    Alpha Vantage company overview snapshots.
    Shared across finance institutions and health companies.
    """
    __tablename__ = "stock_fundamentals"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_stock_fundamentals_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Polymorphic FK: links to either tracked_institutions or tracked_companies
    entity_type = Column(String, nullable=False, index=True)  # 'institution' or 'company'
    entity_id = Column(String, nullable=False, index=True)  # institution_id or company_id
    ticker = Column(String, nullable=False, index=True)

    snapshot_date = Column(Date, nullable=False, index=True)

    # Valuation
    market_cap = Column(Float, nullable=True)  # USD
    pe_ratio = Column(Float, nullable=True)
    forward_pe = Column(Float, nullable=True)
    peg_ratio = Column(Float, nullable=True)
    price_to_book = Column(Float, nullable=True)

    # Earnings
    eps = Column(Float, nullable=True)  # Trailing twelve months
    revenue_ttm = Column(Float, nullable=True)  # USD
    profit_margin = Column(Float, nullable=True)  # Decimal (0.15 = 15%)
    operating_margin = Column(Float, nullable=True)
    return_on_equity = Column(Float, nullable=True)

    # Dividend
    dividend_yield = Column(Float, nullable=True)  # Decimal (0.02 = 2%)
    dividend_per_share = Column(Float, nullable=True)

    # Price range
    week_52_high = Column(Float, nullable=True)
    week_52_low = Column(Float, nullable=True)
    day_50_moving_avg = Column(Float, nullable=True)
    day_200_moving_avg = Column(Float, nullable=True)

    # Metadata
    sector = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    description = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
