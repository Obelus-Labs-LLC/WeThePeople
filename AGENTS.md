# AGENTS.md — WeThePeople

This file is the entry point for any AI agent (Claude Code, codegen scripts,
story-generation pipelines, audit jobs) operating in this repo. Before doing
any work that produces journal stories, modifies story-generation code, or
audits existing stories, you must load and obey the canonical editorial
standards.

## Canonical editorial standards (REQUIRED READ for any story work)

**`research/EDITORIAL_STANDARDS.md`** is the editorial standard for all story
generation, all auditing of existing stories, and all decisions about what
comes back online and when. It was installed 2026-05-01 after the journal
subdomain was taken offline preemptively in response to outreach from a
working political journalist (Bridge Michigan).

If you are:

- generating a new story (jobs/detect_stories.py, jobs/orchestrate_stories.py,
  scripts/generate_*_stories.py, the chat-driven story builder)
- approving or republishing an existing story
- auditing the published story corpus
- writing or modifying the Twitter bot, RSS feeds, or any other channel that
  surfaces stories to the public
- changing entity-reference logic, verification labels, or the
  "Why This Matters" / "What the Data Doesn't Show" sections

you must load `research/EDITORIAL_STANDARDS.md` and conform to it. If a story
fails the Final Checklist in Part 2, halt instead of publishing.

## Hard rules derived from the editorial standards

These are the most important rules; read the full doc for context:

1. **No "Partially Verified" labels.** A story is either "Fully verified" or
   "Algorithmically generated, not human-verified." Anything else is removed.
2. **No category-first stories.** Don't pick a frame (Revolving Door, STOCK
   Act Violation, etc.) and write toward it. Examine the data first; let the
   facts choose the frame, or decline to publish.
3. **Every dollar figure carries its time window in the same sentence.** No
   "Company X earned $16.3M" without specifying the period. Multi-year totals
   may not be presented as single-year figures.
4. **Entities Referenced must be primary-source attested.** Never include an
   entity inferred from sector classification. If you can't point to a
   specific filing/document ID that names the entity, omit it.
5. **The "What the Data Doesn't Show" section is mandatory** on every story.
6. **Twitter bot stays paused** until a human reviewer signs off on each
   story flagged "Fully Verified."

## Rebuild sequence (Part 4 of the editorial standards)

Until the rebuild sequence in Part 4 of the editorial standards is complete
in order, the journal stays offline. Do not re-add the journal subdomain in
Vercel, do not unpause the Twitter bot, and do not auto-publish any new
stories without a human reviewer in the loop.

## Audit machinery

- `scripts/audit_published_stories.py` — automated regression audit against
  the failure-mode catalog in Part 3.
- `.planning/STORY_AUDIT_REPORT.md` — most recent regression report (local,
  gitignored; the canonical version is the next regenerated copy).
- `services/twitter_bot.py` — must respect the `WTP_BOT_PAUSED=1` env var or
  the `data/.bot_paused` sentinel file.

## User feedback rules (operational)

These are sticky rules from the user separate from the editorial standards:

- Never delete files or DB rows without explicit approval.
- Never run a local dev server; the user tests on the live website.
- Never include `Co-Authored-By` in git commits.
- Never use em-dashes or en-dashes in user-facing prose.
- Never give time estimates for builds.
- Don't enumerate or contact the user's named personal contacts.
- Story dedup is good; focus on unique stories, not loosening dedup.
