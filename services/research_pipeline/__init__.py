"""
Research-agent-driven story generation pipeline.

Architecture overview (locked 2026-04-27):

    detect_stories cron (every 3 days)
    └─> orchestrator.run_daily()
        ├─> black_swan.scan()                  # rare events override rotation
        ├─> rotating_selector.pick()           # else novelty-weighted rotation
        ├─> dedup_gate.is_fresh()              # skip if same story already queued
        ├─> orphan_check.validate_entities()   # WTP-side pre-write check
        ├─> veritas_client.pre_write_gate()    # Veritas-side pre-write checks
        ├─> research_agent.run_from_brief()    # forked agent produces ResearchDocument
        ├─> editor pass                        # ResearchDocument -> Story shape
        ├─> veritas_client.post_write_gate()   # async, returns verification_id
        ├─> veritas_client.poll_verdict()      # poll until verdict ready
        ├─> on soft reject: revision loop (capped at 2)
        ├─> on hard reject: kill + ops log
        └─> on pass: insert Story (status=draft) for human review

The pipeline does NOT auto-publish. Every successful pass still routes to
the existing /ops/story-queue review flow.

Module map:
    orchestrator.py        Daily entry point, owns the state machine.
    black_swan.py          Rare-event detector, calibrated for real rarities.
    rotating_selector.py   Novelty-weighted rotation across sectors / entities.
    dedup_gate.py          (entity, pattern, date_range) freshness check.
    orphan_check.py        Validates entity_ids against tracked_* tables.
    veritas_client.py      HTTP client for Veritas API (pre/post-write gates,
                           vault writes, async polling).
"""
