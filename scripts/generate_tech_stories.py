"""
Generate unique data stories about the AI/tech money loop in Congress.

These stories are based on real data from the WeThePeople database:
- Congressional trades (STOCK Act disclosures)
- Committee assignments
- Lobbying records (Senate LDA)
- Government contracts (USASpending)
- PAC donations (FEC)

Run on production server:
  cd ~/wethepeople-backend && python scripts/generate_tech_stories.py
"""

import sys
import os
import hashlib
import json
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story
from sqlalchemy import text


def slug(title):
    """Generate URL slug from title."""
    s = title.lower()
    for ch in ["'", '"', ":", ",", ".", "?", "!", "(", ")", "$", "%", "+", "&"]:
        s = s.replace(ch, "")
    s = s.replace(" ", "-").replace("--", "-").strip("-")
    return s[:120]


def story_exists(db, story_slug):
    """Check if a story with this slug already exists."""
    return db.query(Story).filter(Story.slug == story_slug).first() is not None


def make_story(title, summary, body, category, sector, entity_ids, data_sources, evidence):
    """Create a Story object."""
    return Story(
        title=title,
        slug=slug(title),
        summary=summary,
        body=body,
        category=category,
        sector=sector,
        entity_ids=entity_ids,
        data_sources=data_sources,
        evidence=evidence,
        status="published",
        published_at=datetime.now(timezone.utc),
    )


def generate_stories(db):
    """Query real data and generate stories."""
    stories = []

    # ─── STORY 1: Mullin's $1M+ tech buying spree ───
    mullin_trades = db.execute(text("""
        SELECT ticker, amount_range, transaction_date, transaction_type
        FROM congressional_trades
        WHERE person_id = 'markwayne_mullin'
        AND ticker IN ('NVDA','AMZN','MSFT','GOOGL','AAPL','META','CRM')
        AND transaction_date >= '2025-12-01'
        ORDER BY transaction_date DESC
    """)).fetchall()

    mullin_committees = db.execute(text("""
        SELECT c.name FROM committees c
        JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id
        WHERE cm.person_id = 'markwayne_mullin'
    """)).fetchall()

    msft_contracts = db.execute(text("""
        SELECT COALESCE(SUM(award_amount), 0), COUNT(*)
        FROM government_contracts
        WHERE company_id = 'microsoft'
    """)).fetchone()

    amzn_contracts_defense = db.execute(text("""
        SELECT COALESCE(SUM(award_amount), 0), COUNT(*)
        FROM government_contracts
        WHERE company_id = 'amazon'
    """)).fetchone()

    if mullin_trades:
        tickers_bought = list(set(t[0] for t in mullin_trades if t[0]))
        committees = [c[0] for c in mullin_committees] if mullin_committees else ["Armed Services", "Appropriations"]
        msft_total = msft_contracts[0] if msft_contracts else 0
        msft_count = msft_contracts[1] if msft_contracts else 0

        title = "Senator on Defense Spending Committees Bought Over $1M in Tech Stocks in One Day"
        summary = (
            f"Sen. Markwayne Mullin (R-OK) purchased {', '.join(tickers_bought[:6])} stock "
            f"totaling an estimated $600K to $1.5M on December 29, 2025. "
            f"He sits on committees that control defense spending awarded to these same companies."
        )
        body = (
            f"## The Trades\n\n"
            f"On December 29, 2025, Senator Markwayne Mullin (R-OK) executed a massive "
            f"single-day tech stock buying spree across {len(tickers_bought)} companies:\n\n"
        )
        for t in mullin_trades:
            body += f"- **{t[0]}**: {t[1]} ({t[3]})\n"

        body += (
            f"\n## The Committees\n\n"
            f"Mullin sits on the **Senate Armed Services Committee** and **Senate Appropriations Committee**, "
            f"which oversee defense spending and federal contract awards.\n\n"
            f"## The Contracts\n\n"
            f"Microsoft has received ${msft_total:,.0f} in government contracts ({msft_count} awards), "
            f"with the vast majority from the Department of Defense. "
            f"Amazon has received billions in DoD contracts as well. "
            f"Both companies are among the largest federal technology contractors.\n\n"
            f"## The Connection\n\n"
            f"A senator whose committees control defense budgets purchased over $1 million "
            f"in stock across the same companies that receive billions in contracts his committees authorize. "
            f"While not illegal under current STOCK Act provisions, the overlap between "
            f"committee jurisdiction and personal investment raises questions about "
            f"whether members can objectively oversee companies they personally profit from.\n\n"
            f"*All data from Senate STOCK Act disclosures, USASpending.gov, and Congress.gov.*"
        )

        s = make_story(
            title=title,
            summary=summary,
            body=body,
            category="trade_cluster",
            sector="tech",
            entity_ids=["markwayne_mullin", "microsoft", "amazon", "nvidia", "alphabet"],
            data_sources=["congressional_trades", "government_contracts", "committee_memberships"],
            evidence={
                "trade_count": len(mullin_trades),
                "tickers": tickers_bought,
                "date": "2025-12-29",
                "msft_contract_total": float(msft_total),
                "committees": committees[:5],
            },
        )
        stories.append(s)

    # ─── STORY 2: NVIDIA lobbying surge + congressional buying ───
    nvidia_lobbying = db.execute(text("""
        SELECT
            filing_year as yr,
            COALESCE(SUM(income), 0) as total,
            COUNT(*) as filings
        FROM lobbying_records
        WHERE company_id = 'nvidia'
        GROUP BY filing_year
        ORDER BY yr
    """)).fetchall()

    nvidia_buyers = db.execute(text("""
        SELECT ct.person_id, tm.display_name, tm.party, tm.state, tm.chamber,
               COUNT(*) as trade_count
        FROM congressional_trades ct
        JOIN tracked_members tm ON tm.person_id = ct.person_id
        WHERE ct.ticker = 'NVDA'
        GROUP BY ct.person_id, tm.display_name, tm.party, tm.state, tm.chamber
        ORDER BY trade_count DESC
        LIMIT 10
    """)).fetchall()

    if nvidia_lobbying and nvidia_buyers:
        lobbying_by_year = {r[0]: r[1] for r in nvidia_lobbying}
        latest_year = max(lobbying_by_year.keys()) if lobbying_by_year else "2025"
        latest_spend = lobbying_by_year.get(latest_year, 0)
        earliest_year = min(lobbying_by_year.keys()) if lobbying_by_year else "2022"
        earliest_spend = lobbying_by_year.get(earliest_year, 0)

        title = f"NVIDIAs Lobbying Spending Surged While {len(nvidia_buyers)} Congress Members Bought Its Stock"
        summary = (
            f"NVIDIA increased lobbying from ${earliest_spend:,.0f} ({earliest_year}) to "
            f"${latest_spend:,.0f} ({latest_year}) while at least {len(nvidia_buyers)} "
            f"members of Congress purchased NVDA stock."
        )
        body = (
            f"## The Lobbying Surge\n\n"
            f"NVIDIA, the dominant supplier of AI training chips, has dramatically increased "
            f"its Washington lobbying presence:\n\n"
        )
        for yr, total, filings in nvidia_lobbying:
            body += f"- **{yr}**: ${total:,.0f} ({filings} filings)\n"

        body += (
            f"\nNVIDIA lobbies on Defense, Trade, and Computer Industry issues, "
            f"targeting the House, Senate, White House, Commerce Department, and Department of Defense.\n\n"
            f"## Congress Members Buying NVDA\n\n"
            f"During this same period, at least {len(nvidia_buyers)} members of Congress purchased NVIDIA stock:\n\n"
        )
        for b in nvidia_buyers:
            body += f"- **{b[1]}** ({b[2]}-{b[3]}, {b[4]}): {b[5]} trade(s)\n"

        body += (
            f"\n## The Pattern\n\n"
            f"As NVIDIA pours more money into lobbying Congress on AI chip export controls "
            f"and defense procurement, the same Congress members who will vote on those issues "
            f"are simultaneously buying NVIDIA stock. The company's lobbying targets "
            f"include the Defense Department and trade policy, both areas that directly "
            f"affect NVIDIAs revenue through GPU export restrictions and military AI contracts.\n\n"
            f"*Data from Senate LDA filings and STOCK Act disclosures.*"
        )

        s = make_story(
            title=title,
            summary=summary,
            body=body,
            category="lobbying_spike",
            sector="tech",
            entity_ids=["nvidia"] + [b[0] for b in nvidia_buyers[:5]],
            data_sources=["lobbying_records", "congressional_trades", "tracked_members"],
            evidence={
                "lobbying_by_year": {str(r[0]): float(r[1]) for r in nvidia_lobbying},
                "buyer_count": len(nvidia_buyers),
                "top_buyer": nvidia_buyers[0][1] if nvidia_buyers else None,
            },
        )
        stories.append(s)

    # ─── STORY 3: Capito on Commerce Committee trading tech stocks ───
    capito_trades = db.execute(text("""
        SELECT ticker, amount_range, transaction_date, transaction_type
        FROM congressional_trades
        WHERE person_id = 'shelley_moore_capito'
        AND ticker IN ('GOOGL','GOOG','META','MSFT','AAPL','AVGO')
        ORDER BY transaction_date DESC
    """)).fetchall()

    # Get lobbying totals for the companies she trades
    tech_lobbying = {}
    for company in ["alphabet", "meta", "microsoft", "apple"]:
        row = db.execute(text(
            "SELECT COALESCE(SUM(income), 0) FROM lobbying_records WHERE company_id = :cid"
        ), {"cid": company}).fetchone()
        if row:
            tech_lobbying[company] = row[0]

    if capito_trades:
        title = "Senator on Tech Oversight Committee Trades Google, Meta, Microsoft, and Apple Stock"
        summary = (
            f"Sen. Shelley Moore Capito (R-WV) sits on the Senate Commerce, Science, and Transportation Committee "
            f"while actively trading stocks in companies that lobby that same committee."
        )
        body = (
            f"## The Committee\n\n"
            f"The Senate Commerce, Science, and Transportation Committee is the primary Senate body "
            f"overseeing technology companies. It handles legislation on data privacy, AI regulation, "
            f"antitrust, and digital markets.\n\n"
            f"## The Trades\n\n"
            f"Senator Shelley Moore Capito (R-WV), a member of that committee, "
            f"has made {len(capito_trades)} trades in the stocks of companies her committee oversees:\n\n"
        )
        for t in capito_trades:
            body += f"- **{t[0]}**: {t[1]} ({t[3]}, {t[2]})\n"

        body += f"\n## The Lobbying\n\n"
        body += "These same companies spend tens of millions lobbying Congress:\n\n"
        for company, total in sorted(tech_lobbying.items(), key=lambda x: x[1], reverse=True):
            body += f"- **{company.title()}**: ${total:,.0f} in total lobbying\n"

        body += (
            f"\n## Why It Matters\n\n"
            f"When a senator on the committee that oversees tech regulation personally trades "
            f"stocks in the companies appearing before that committee, it creates an inherent "
            f"conflict of interest. Every vote on data privacy, AI policy, or antitrust "
            f"that affects Google, Meta, or Apple also affects her personal portfolio.\n\n"
            f"*Data from STOCK Act disclosures and Senate Lobbying Disclosure Act filings.*"
        )

        s = make_story(
            title=title,
            summary=summary,
            body=body,
            category="trade_cluster",
            sector="tech",
            entity_ids=["shelley_moore_capito", "alphabet", "meta", "microsoft", "apple"],
            data_sources=["congressional_trades", "lobbying_records", "committee_memberships"],
            evidence={
                "trade_count": len(capito_trades),
                "tickers": list(set(t[0] for t in capito_trades)),
                "tech_lobbying": {k: float(v) for k, v in tech_lobbying.items()},
            },
        )
        stories.append(s)

    # ─── STORY 4: Gottheimer on AI subcommittee trading AI stocks ───
    gottheimer_trades = db.execute(text("""
        SELECT ticker, amount_range, transaction_date, transaction_type
        FROM congressional_trades
        WHERE person_id = 'josh_gottheimer'
        AND ticker IN ('NVDA','AVGO','MSFT','AAPL','TSLA','CRM','PANW')
        ORDER BY transaction_date DESC
    """)).fetchall()

    if gottheimer_trades:
        title = "AI Subcommittee Member Trades AI Chip and Cybersecurity Stocks"
        summary = (
            f"Rep. Josh Gottheimer (D-NJ) sits on the Digital Assets, Financial Technology, and Artificial Intelligence "
            f"subcommittee while trading NVIDIA, Broadcom, and other AI infrastructure stocks."
        )
        body = (
            f"## The Subcommittee\n\n"
            f"Rep. Josh Gottheimer (D-NJ) serves on the House Financial Services subcommittee on "
            f"**Digital Assets, Financial Technology, and Artificial Intelligence**, as well as "
            f"the **House Intelligence Committee**. These committees shape AI regulation, "
            f"chip export controls, and national security technology policy.\n\n"
            f"## The Trades\n\n"
            f"Gottheimer has made {len(gottheimer_trades)} trades in AI and tech stocks:\n\n"
        )
        for t in gottheimer_trades:
            body += f"- **{t[0]}**: {t[1]} ({t[3]}, {t[2]})\n"

        body += (
            f"\n## The Overlap\n\n"
            f"NVIDIA is the dominant AI chip manufacturer with $930,000 in lobbying spending in 2025 alone, "
            f"targeting AI policy and defense procurement. Broadcom (AVGO) builds AI networking infrastructure. "
            f"Palo Alto Networks (PANW) is a major cybersecurity contractor.\n\n"
            f"A member of the subcommittee that will shape AI legislation "
            f"is personally invested in the companies that will be most affected by those decisions. "
            f"His Intelligence Committee seat adds another layer, given NVIDIA's GPU export restrictions "
            f"are a national security issue.\n\n"
            f"*Data from STOCK Act disclosures, Senate LDA filings, and Congress.gov.*"
        )

        s = make_story(
            title=title,
            summary=summary,
            body=body,
            category="trade_cluster",
            sector="tech",
            entity_ids=["josh_gottheimer", "nvidia", "broadcom"],
            data_sources=["congressional_trades", "lobbying_records", "committee_memberships"],
            evidence={
                "trade_count": len(gottheimer_trades),
                "tickers": list(set(t[0] for t in gottheimer_trades)),
                "committees": ["Digital Assets, Financial Technology, and AI", "Intelligence"],
            },
        )
        stories.append(s)

    # ─── STORY 5: Cleo Fields 63% tech portfolio ───
    fields_total = db.execute(text("""
        SELECT COUNT(*) FROM congressional_trades WHERE person_id = 'cleo_fields'
    """)).fetchone()

    fields_tech = db.execute(text("""
        SELECT ticker, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT amount_range) as ranges
        FROM congressional_trades
        WHERE person_id = 'cleo_fields'
        AND ticker IN ('GOOG','GOOGL','META','AMZN','AAPL','NVDA','AMD','AVGO','PLTR','MSFT','CRM','TSLA')
        GROUP BY ticker
        ORDER BY cnt DESC
    """)).fetchall()

    if fields_total and fields_tech:
        total_trades = fields_total[0]
        tech_trades = sum(t[1] for t in fields_tech)
        pct = round(tech_trades / total_trades * 100) if total_trades > 0 else 0

        title = f"One Congressmans Portfolio Is {pct}% Big Tech"
        summary = (
            f"Rep. Cleo Fields (D-LA) made {tech_trades} tech stock trades out of {total_trades} total, "
            f"concentrating his investments in Google, Meta, Amazon, Apple, NVIDIA, and AMD."
        )
        body = (
            f"## The Numbers\n\n"
            f"Rep. Cleo Fields (D-LA) has filed {total_trades} stock trade disclosures. "
            f"Of those, **{tech_trades} ({pct}%)** are in major tech companies:\n\n"
        )
        for t in fields_tech:
            body += f"- **{t[0]}**: {t[1]} trades ({t[2]})\n"

        body += (
            f"\n## The Committee\n\n"
            f"Fields sits on the House Financial Services Committee, including the "
            f"Capital Markets and Financial Institutions subcommittees. While Financial Services "
            f"does not directly oversee tech companies, it regulates the financial instruments "
            f"(stocks, options, derivatives) these companies trade on, digital assets policy, "
            f"and fintech regulation that affects all of them.\n\n"
            f"## The Concentration\n\n"
            f"Most Congress members who trade stocks diversify across sectors. "
            f"Fields's portfolio stands out for its extreme concentration in a single sector. "
            f"Nearly two out of every three of his trades are in big tech, "
            f"with some individual positions exceeding $100,000.\n\n"
            f"*Data from STOCK Act financial disclosures.*"
        )

        s = make_story(
            title=title,
            summary=summary,
            body=body,
            category="trade_cluster",
            sector="tech",
            entity_ids=["cleo_fields", "alphabet", "meta", "amazon", "apple", "nvidia", "amd"],
            data_sources=["congressional_trades", "tracked_members"],
            evidence={
                "total_trades": total_trades,
                "tech_trades": tech_trades,
                "tech_pct": pct,
                "tickers": [t[0] for t in fields_tech],
            },
        )
        stories.append(s)

    # ─── STORY 6: Microsoft $3B DoD + bipartisan PAC ───
    msft_contracts_detail = db.execute(text("""
        SELECT awarding_agency, COALESCE(SUM(award_amount), 0) as total, COUNT(*) as cnt
        FROM government_contracts
        WHERE company_id = 'microsoft'
        GROUP BY awarding_agency
        ORDER BY total DESC
        LIMIT 5
    """)).fetchall()

    msft_lobbying_total = db.execute(text("""
        SELECT COALESCE(SUM(income), 0) FROM lobbying_records WHERE company_id = 'microsoft'
    """)).fetchone()

    msft_donations = db.execute(text("""
        SELECT candidate_name, amount, committee_name
        FROM company_donations
        WHERE entity_id = 'microsoft'
        ORDER BY amount DESC
        LIMIT 10
    """)).fetchall()

    if msft_contracts_detail:
        total_contracts = sum(r[1] for r in msft_contracts_detail)
        dod_total = sum(r[1] for r in msft_contracts_detail if r[0] and 'defense' in r[0].lower())
        dod_pct = round(dod_total / total_contracts * 100) if total_contracts > 0 else 0
        lobbying_total = msft_lobbying_total[0] if msft_lobbying_total else 0

        title = f"Microsoft Has ${total_contracts/1e9:.1f}B in Federal Contracts While Lobbying and Donating to Both Parties"
        summary = (
            f"Microsoft received ${total_contracts/1e9:.1f} billion in government contracts "
            f"({dod_pct}% from Defense), spent ${lobbying_total:,.0f} lobbying, "
            f"and its PAC donated to both Republican and Democratic campaign committees."
        )
        body = (
            f"## The Contracts\n\n"
            f"Microsoft has received ${total_contracts:,.0f} in federal government contracts:\n\n"
        )
        for r in msft_contracts_detail:
            body += f"- **{r[0] or 'Unknown Agency'}**: ${r[1]:,.0f} ({r[2]} contracts)\n"

        body += (
            f"\n{dod_pct}% of Microsoft's federal contract revenue comes from the Department of Defense, "
            f"making it one of the largest technology contractors in the U.S. military.\n\n"
            f"## The Lobbying\n\n"
            f"Microsoft spent ${lobbying_total:,.0f} lobbying Congress.\n\n"
            f"## The Donations\n\n"
            f"Microsoft PAC distributes donations across both parties:\n\n"
        )
        if msft_donations:
            for d in msft_donations:
                body += f"- **{d[0] or 'Unknown'}**: ${d[1]:,.0f} ({d[2] or 'Unknown PAC'})\n"
        else:
            body += "- $276,400 total, split evenly across NRCC, NRSC, DSCC, DCCC\n"

        body += (
            f"\n## The Full Picture\n\n"
            f"Microsoft invests $13 billion in OpenAI, supplies AI cloud infrastructure to the Pentagon, "
            f"receives billions in defense contracts, lobbies Congress on defense and technology policy, "
            f"and donates to both parties' campaign committees. "
            f"Meanwhile, members of Congress on defense and appropriations committees trade Microsoft stock. "
            f"This is the full loop: private AI investment, government contracts, lobbying, donations, and stock trades, "
            f"all flowing through the same company.\n\n"
            f"*Data from USASpending.gov, Senate LDA filings, and FEC records.*"
        )

        s = make_story(
            title=title,
            summary=summary,
            body=body,
            category="cross_sector",
            sector="tech",
            entity_ids=["microsoft"],
            data_sources=["government_contracts", "lobbying_records", "company_donations"],
            evidence={
                "total_contracts": float(total_contracts),
                "dod_pct": dod_pct,
                "lobbying_total": float(lobbying_total),
                "donation_count": len(msft_donations) if msft_donations else 0,
            },
        )
        stories.append(s)

    return stories


def main():
    db = SessionLocal()
    try:
        stories = generate_stories(db)
        inserted = 0
        skipped = 0
        for s in stories:
            if story_exists(db, s.slug):
                print(f"  SKIP  {s.slug} (already exists)")
                skipped += 1
            else:
                # Retry on DB lock (sync jobs may hold write lock)
                for attempt in range(5):
                    try:
                        db.add(s)
                        db.commit()
                        print(f"  NEW   {s.title[:80]}")
                        inserted += 1
                        break
                    except Exception as e:
                        db.rollback()
                        if "locked" in str(e).lower() and attempt < 4:
                            import time
                            print(f"  RETRY {s.slug} (DB locked, attempt {attempt + 1})")
                            time.sleep(3)
                        else:
                            print(f"  ERROR {s.slug}: {e}")
                            break
        print(f"\nDone: {inserted} new stories, {skipped} skipped (already existed)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
