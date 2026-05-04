# WeThePeople Ecosystem

Three connected websites, one monorepo, one backend API.

## Sites

| Directory | Site | Domain (planned) | Purpose |
|---|---|---|---|
| `frontend/` | **WeThePeople** (core) | wethepeopleforus.com | Lobbying tracker. Follow the money from industry to politics. 7 sectors, influence network, congressional trades, claim verification. |
| `sites/research/` | **WTP Research** | research.wethepeopleforus.com | Deep-dive research tools. Patent explorer, drug lookup, clinical trials, insider trades, company financials, macro indicators. |
| `sites/journal/` | **The Influence Journal** | journal.wethepeopleforus.com | Stories, blog posts, data investigations, and weekly newsletter. Every claim cited. |

## Architecture

- All three sites share the same backend API at `api.wethepeopleforus.com`
- All three are in this monorepo for shared types, components, and coordinated deployment
- Shared components live in `sites/shared/` (e.g., `EcosystemNav.tsx` for cross-site navigation)
- Each site is an independent Vite app with its own `package.json`, build, and deploy

## Stack

All three sites use the same frontend stack:
- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- React Router
- Framer Motion

## Deployment

- **WeThePeople**: Vercel auto-deploy from `frontend/` on push to main
- **WTP Research**: Vercel project (planned), root directory `sites/research/`
- **The Influence Journal**: Vercel project (planned), root directory `sites/journal/`

DNS subdomains (`research.` and `journal.`) will be configured in Vercel DNS when the sites are ready for production.
