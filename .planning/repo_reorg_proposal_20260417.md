# Repo Reorganization Proposal — 2026-04-17

Scope: the whole WeThePeople local directory. Two deliverables:

1. Clean the existing tree (dead code, stale dupes, misplaced infra config)
2. Propose a Google-style monorepo layout we can migrate to

**STATUS: Phase 1 + Terraform (Option B-as-archive) + docs/internal archive — EXECUTED 2026-04-17.** Phase 2/3/4 parked per user direction.

### What was actually done

**Deleted outright (verified zero importers, gitignored, or confirmed-identical):**
- `frontend/frontend/` — 4 files, 3 byte-identical to live `frontend/src/data/*`, 1 stale subset
- `frontend/mobile/` — 1 stale `sectors.ts`
- Root `node_modules/` (336 MB), `dist/` (24 MB), `.expo/` — gitignored Expo runtime/build junk
- `_check_db.py`, `_figma_export/` (412K), `wallet_wtpdb/` (77K), `audit/`, `SESSION_SUMMARY.md`

**Archived to `_archive/` (gitignored local-only preservation; git history also keeps them):**
- `_archive/expo_root_20260323/` — root Expo source (App.tsx, index.ts, src/ with 103 files including 40+ screens missing from `mobile/src/`, app.config.ts, app.json, eas.json, assets/, package.json, package-lock.json, tsconfig.json). Preserved in case any of the 40+ orphan screens are salvageable.
- `_archive/migrations_pre_alembic/` — 3 pre-alembic migration scripts
- `_archive/docs_internal_cleanup_phases/` — 34 cleanup-phase reports
- `_archive/terraform_gcp_oracle_stale/` — GCP + Oracle Terraform files (user OK'd either A rewrite or B delete; chose archive-then-delete path: files preserved locally as reference, removed from tracked tree)

**Result:**
- Root tree: ~60 → 44 entries
- 127 git deletions staged
- ~340 MB disk reclaimed (mostly root `node_modules/`)
- Zero behavior change: backend imports clean; no code touched; systemd/Vercel/cron unaffected
- Parked: Phase 2/3/4 Google-style reorg (`apps/` `packages/` `infra/`) — separate session

---

## 1. What I found (the part you noticed, and then some)

You spotted `frontend/frontend/` and `frontend/mobile/`. That's the tip of a bigger iceberg — there are **three** layers of mobile-app duplication in this repo right now.

### The root-level stale Expo app (BIG issue)

At the repo root there's a full **old** React Native / Expo mobile project that's been superseded by `mobile/`:

```
WeThePeople/
├── App.tsx                ← OLD Expo entrypoint
├── index.ts               ← OLD Expo entrypoint
├── src/                   ← OLD mobile src (api/, components/, screens/, navigation/)
├── app.config.ts, app.json, eas.json   ← OLD Expo config
├── .expo/                 ← OLD Expo runtime state
├── assets/                ← OLD Expo static assets
├── dist/                  ← OLD Expo build output
├── package.json           ← name=wethepeople-app, expo deps
├── package-lock.json
└── node_modules/ (336 MB) ← installed for the OLD app
```

`mobile/` has a **newer** copy of the same project (different-but-overlapping code). The root files are dead — nothing in the current monorepo references them.

`diff -rq src/ mobile/src/` confirms they've diverged; the root `src/` has 30+ more components the mobile version doesn't. That's because we kept editing mobile in `mobile/` and the root src/ got frozen.

### The nested duplicates inside `frontend/`

```
frontend/
├── frontend/              ← nonsense nesting
│   └── src/data/          ← 4 files (financeLogos.ts, healthLogos.ts, sectors.ts, techLogos.ts)
│       (nothing imports from frontend/frontend/*)
└── mobile/                ← also nonsense
    └── src/data/          ← 1 file (sectors.ts)
        (nothing imports from frontend/mobile/*)
```

These are leftover snapshots from some earlier reorg attempt — probably `cp -r` that never got pruned.

### Other dead weight at the root

| Path | Size | Gitignored? | Fate |
|---|---|---|---|
| `_check_db.py` | 1.4K | yes (`_check_db.py`) | delete — single-use debug script |
| `_figma_export/` | 412K | yes (`_figma_export/`) | delete — Figma design dump, not source |
| `wallet_wtpdb/` | 77K | yes (`wallet_wtpdb/`) | delete — Oracle Autonomous DB wallet, we moved off Oracle |
| `migrations/` | 3 files | no | fold into `alembic/versions/` or delete (superseded) |
| `dist/` | ~40 files | yes (`dist/`) | delete — old Expo build output |
| `audit/daily_runs/` | 1 JSON from Feb | yes (`audit/`) | delete — stale |
| `SESSION_SUMMARY.md` | 148 lines (March) | yes | delete — stale |
| `_figma_export/`, `node_modules/` (root) | 336 MB | yes | delete after Expo move |
| `docs/internal/` | 10 files | yes (`docs/`) | delete or move to `_archive/` — all from old cleanup phases |

### The Terraform config is fully stale (you asked)

Your other Hetzner-side project was right. `deploy/terraform/` claims to codify:

```
# WeThePeople — Terraform Main Configuration
# Represents the CURRENT infrastructure state:
#   - GCP e2-medium VM (production API + scheduler)     ← WE'RE NOT ON GCP
#   - Oracle Cloud free tier                             ← WE'RE NOT ON ORACLE
#   - DNS: api.wethepeopleforus.com -> GCP VM            ← DNS points at Hetzner now
```

What's actually running:
- **Production API + scheduler**: Hetzner CAX11 ARM at `138.199.214.174` ($3.99/mo)
- **Frontend**: Vercel (auto-deploy from GitHub — not managed by Terraform at all)
- **Veritas**: sibling systemd unit on same Hetzner box, localhost:8007
- **DB**: local SQLite on Hetzner, WAL mode, 4.3 GB

The files `deploy/terraform/gcp.tf`, `oci.tf`, `dns.tf` still reference the static IP `34.75.8.107` (GCP) and Oracle ARM flex VMs. None of this maps to reality. Options:

- **A. Rewrite** `deploy/terraform/` to use `hetznercloud/hcloud` provider + Vercel provider — matches reality, enables `terraform import`
- **B. Delete** `deploy/terraform/` entirely — you're managing infra manually (SSH + Vercel dashboard) so IaC is aspirational, not real
- **C. Archive** it to `_archive/terraform-gcp-oracle/` as historical record

I recommend **B** for now (delete). We're not using Terraform at all; keeping stale IaC in the repo actively misleads anyone — including other Claude instances — who reads it.

## 2. What a Google-scale monorepo would look like

If an L8/L9 Staff/Senior Staff at Google were asked to reorganize this, they would **separate by deployable unit**, not by language:

```
WeThePeople/
├── .github/                      # CI/CD workflows
├── apps/                         # deployable applications
│   ├── api/                      # FastAPI backend (currently scattered at repo root)
│   │   ├── main.py
│   │   ├── routers/ models/ services/ middleware/
│   │   ├── connectors/ jobs/ scripts/ utils/ tests/
│   │   ├── alembic/
│   │   ├── requirements.txt pyproject.toml pytest.ini
│   │   └── Dockerfile
│   ├── web/                      # main Vite/React site (was frontend/)
│   ├── mobile/                   # Expo app (was mobile/)
│   ├── research/                 # was sites/research/
│   ├── journal/                  # was sites/journal/
│   └── verify/                   # was sites/verify/
├── packages/                     # shared TS/JS libraries
│   └── ui-shared/                # was sites/shared/
├── infra/                        # all ops + deployment
│   ├── terraform/                # Hetzner + Vercel, matching reality
│   ├── systemd/                  # wethepeople.service, wethepeople-scheduler.service
│   ├── scripts/                  # deploy-*.sh, rollback.sh
│   └── nginx/                    # (if any)
├── docs/
│   ├── architecture/             # data flow, ADRs
│   └── runbooks/                 # operational procedures
├── .planning/                    # session planning docs (this file lives here)
├── CHANGELOG.md  CLAUDE.md  README.md  LICENSE
└── .gitignore  .env.example
```

### Why this layout

- **`apps/`** tells anyone at a glance "here are the 5 things we deploy." Right now it's unclear — you have sites in `sites/`, one site in `frontend/`, one in `mobile/`, and the backend smeared across the root.
- **`packages/`** is where cross-app shared code lives (the `sites/shared/` folder fits here).
- **`infra/`** is the one true home for Terraform + Docker + systemd + shell scripts. Today these are scattered: `deploy/`, `Dockerfile` (root), `docker-compose.yml` (root), systemd units inside `deploy/`, scripts inside `scripts/` which is a dual-use directory for Python + shell.
- **Backend as `apps/api/`** — this is the biggest change and the one that buys the most clarity. Today, when someone opens the repo root, they see 20+ backend Python dirs mixed with 12+ mobile files mixed with Docker configs mixed with frontend dirs. Moving the backend into `apps/api/` cleans that up completely.

### Migration risk

The backend move (`→ apps/api/`) is **invasive**. All imports like `from jobs.sync_X import Y` need to become `from apps.api.jobs.sync_X import Y` — or we fix it with a `setup.cfg` / `pyproject.toml` package path. It would also change the systemd unit, the Dockerfile, every sync job, every cron entry. I would **not** recommend doing this in the same commit as the cleanup. Staged plan:

- **Phase 1 (low risk, ~10 min)**: Kill dead code & stale dupes (items in section 1 above). No import changes, no deploy changes.
- **Phase 2 (medium risk, ~30 min)**: Rewrite `deploy/terraform/` for Hetzner+Vercel or delete it.
- **Phase 3 (high risk, ~2 hr + deploy validation)**: Move backend to `apps/api/`, rename `frontend/` → `apps/web/`, update imports, Dockerfile, systemd unit path, cron paths.
- **Phase 4 (low risk, ~20 min)**: Move `sites/*` → `apps/*` and `sites/shared/` → `packages/ui-shared/`. Update Vercel project roots.

---

## 3. Proposed cleanup (Phase 1 — safe deletions)

Everything here is either: (a) gitignored, (b) has no importers, or (c) superseded by a clearly-newer version.

**Delete from root** (the stale Expo app — `mobile/` is the live one):
- `App.tsx`
- `index.ts`
- `src/` (entire tree — superseded by `mobile/src/`)
- `app.config.ts`, `app.json`, `eas.json`
- `.expo/`
- `assets/` (Expo-only — web site has `frontend/public/`)
- `dist/` (old Expo build)
- `package.json`, `package-lock.json` (root — Expo manifest)
- `node_modules/` (root — 336 MB of Expo deps, not needed)

**Delete nested dupes:**
- `frontend/frontend/` (nothing imports it)
- `frontend/mobile/` (nothing imports it)

**Delete stale/debug:**
- `_check_db.py`
- `_figma_export/`
- `wallet_wtpdb/` (no longer on Oracle)
- `migrations/` (3 ad-hoc scripts superseded by `alembic/`)
- `audit/` (stale daily run)
- `SESSION_SUMMARY.md` (March)
- `docs/internal/` (old cleanup-phase artifacts; keep `docs/adr/`, `docs/*.md` live docs)

**Rewrite or delete:**
- `deploy/terraform/` — pick option A/B/C above

### Expected result after Phase 1

- Root directory count: **~60 entries → ~30 entries**
- Disk reclaim: **~340 MB** (mostly root `node_modules/`)
- Zero behavior change; no deploys affected

---

## 4. Open questions for you

1. **Root Expo dupe** — delete all root-level Expo files? (`App.tsx`, root `src/`, `package.json`, etc.) I'm 99% sure `mobile/` is the real one but want confirmation before axing the root copy.
2. **Terraform** — **A rewrite for Hetzner, B delete entirely, C archive**. My vote: B.
3. **Phase 2 (Google layout)** — do you want me to execute it now, or park the proposal and just do the cleanup?
4. **`docs/internal/`** — delete or move to `_archive/`?

On your signal I'll do Phase 1 + whichever Terraform option you pick. Phase 2/3/4 (the big Google-style reorg) I'd queue for a separate session because it needs careful import/deploy validation.
