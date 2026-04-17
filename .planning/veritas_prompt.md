# Veritas — prompt to paste into your Veritas Claude project

Copy everything between the `---` lines into a fresh Claude Code session **inside the Veritas repo** (`/home/dshon/veritas-service` on Hetzner, or wherever the repo lives locally for you).

---

I'm picking up a Veritas-side investigation triggered from the WeThePeople monorepo. Here's the situation as of 2026-04-17:

## What happened on the WTP side

- WTP's `/claims/verify` and `/claims/verify-url` endpoints were returning connection-refused errors for days. Root cause: the Veritas systemd unit on Hetzner (`veritas.service`) had been **stopped manually on 2026-04-10 at 06:36 UTC** and then **disabled from boot**, so any reboot or OOM would have kept it down with no auto-recovery.
- I restarted it just now (`systemctl start veritas.service && systemctl enable veritas.service`). `/health` returns 200, extract works, WTP's bridge at `services/claims/veritas_bridge.py` (`VERITAS_URL=http://localhost:8007`) now gets clean responses.
- Service binary: `/home/dshon/veritas-service/.venv/bin/python -m uvicorn veritas.api:app --host 0.0.0.0 --port 8007 --workers 1`
- DB file: `/home/dshon/veritas-service/data/veritas.sqlite` (122KB, all 7 tables present, sources=0 claims=0 — i.e. the DB has only schema, zero persisted content)

## What I need you to investigate and fix in the Veritas repo

1. **Why was the service stopped on Apr 10 and left disabled?** Check `git log` for deploy/ops changes around Apr 9–10, any stop scripts, any recent Makefile / fly.toml edits, and any stop hooks. If there was a reason (migration, rebuild, DB corruption) document it. If it was accidental, add a safeguard — e.g. the install script should always `systemctl enable` the unit.

2. **Boot hardening** — the unit was `disabled`. Review `deploy/` or ops scripts in this repo that touch systemd; make sure whatever installs the unit also enables it. Add a healthcheck section in the systemd unit (`Restart=on-failure`, `RestartSec=10s`) if missing.

3. **Public exposure on port 8007.** The uvicorn binding is `0.0.0.0:8007`, and `journalctl -u veritas.service` shows heavy hostile traffic before Apr 10 (probes for `/api/graphql`, `/api/.env`, `/sonicos/tfa`, etc.) coming from random internet IPs. We only need localhost access from the WTP backend. Either:
   - Bind to `127.0.0.1:8007` in the systemd unit (safest), or
   - Keep `0.0.0.0` but put Veritas behind the existing nginx with a shared-secret header check, and set firewall rules to block 8007 from the internet.
   Pick one, implement it, and make sure WTP's `veritas_bridge.py` still works via `http://localhost:8007`.

4. **Rate limiting on public-ish endpoints.** The bot traffic in the journal log suggests there's no rate limit in front of the unauthenticated endpoints (`/health`, `/docs`, `/openapi.json`). Even for `127.0.0.1`-only, we should rate-limit the POST endpoints (`/api/v1/claims/extract`, `/api/v1/sources/ingest-*`) because WTP's chat feature can burst-fire them. Check what's in `src/veritas/routes/`; if there's a `_rate_limit` dependency, confirm it's applied to everything. If not, add slowapi or starlette-limiter.

5. **Empty-DB concern.** `veritas.sqlite` has zero rows. Is that intentional? Walk me through the data lifecycle: does Veritas persist extracted claims/sources or is everything request/response? If it's supposed to persist, the DB is in a bad state and needs to be bootstrapped or the path needs to be pointed at a different file. If it's purely ephemeral, say so clearly in the README.

6. **WTP evidence scoring issue (WTP's CLAUDE.md known issue #5).** WeThePeople reports "Veritas WTP evidence scoring low — BM25 snippet mismatch". The flow is:
   - WTP calls `POST /api/v1/claims/extract` with free text → gets back extracted claims
   - Then WTP does its own evidence matching against its internal DB
   - But it asked Veritas to return a verification score using WTP's evidence snippets
   The mismatch is in how BM25 tokenizes the WTP snippets vs. Veritas's internal claim text. Look at `src/veritas/scoring.py` and the snippet-matching helpers, and see whether pre-processing (casefold, stopword filter, number normalization) is consistent on both sides. The symptom we'd see from WTP: real relevant WTP evidence scoring below the auto-supported threshold so claims stay `unknown`.

7. **Sanity-test the public API surface from localhost on Hetzner.** After any changes, run:
   ```bash
   curl -s http://localhost:8007/health
   curl -s -X POST http://localhost:8007/api/v1/claims/extract \
     -H 'Content-Type: application/json' \
     -d '{"text":"Goldman Sachs contributed $12 million to lobbying in 2024."}'
   curl -s http://localhost:8007/api/v1/stats
   ```
   All three should return JSON 200s.

8. **Report back** with (a) root cause of the Apr-10 stop + boot-disable, (b) what you changed, (c) whether WTP should now stop getting connection-refused permanently, (d) the scoring-mismatch status. Keep it concise — bullet list is fine. **Do not touch the WTP repo** (`/home/dshon/wethepeople-backend`); that side is already fixed.

## Ground rules from the user (same as WTP project)

- Never delete files without explicit approval.
- Wait for an explicit "OK run it" before making changes. Present the plan first, ask once.
- Keep output minimal. No filler.
- Never include `Co-Authored-By` in commits.
- Never stop the veritas.service unit to run migrations or scripts. If you need exclusive DB access, fork a copy of the SQLite file and work on that.

Start with: (1) inspect `git log --since=2026-04-05 --until=2026-04-11`, (2) inspect the systemd unit file, (3) inspect recent deploys. Then propose a plan before making changes.
