"""V5: Stop redirecting unknown /api/X paths to /api/v1/X.

The bare /api catch-all in api.py was rewriting any /api/* path to /api/v1/*
with a 307. Bot scans for /api/.env, /api/swagger.json, /api/graphql etc.
were getting 307s instead of 404s, telling scanners the path was "interesting"
and inviting follow-up probes. Worse, the rewrite sometimes produced an
infinite redirect loop because /api/v1/.env also doesn't exist and the SPA
catch-all eats it.

Fix: only redirect when the first segment of the path is a real registered
v1 prefix. Everything else 404s.

Idempotent: noop if already patched.
"""
from pathlib import Path

p = Path('/home/dshon/veritas-service/src/veritas/api.py')
src = p.read_text()

if 'KNOWN_V1_PREFIXES' in src:
    print('Already patched.')
    raise SystemExit(0)

old = '''@app.api_route("/api/{path:path}", methods=["GET", "POST", "DELETE"], include_in_schema=False)
async def api_v1_redirect(request: Request, path: str):
    """Redirect unversioned /api/ routes to /api/v1/ for backwards compatibility."""
    new_url = str(request.url).replace("/api/", "/api/v1/", 1)
    return RedirectResponse(url=new_url, status_code=307)
'''

new = '''# Real v1 prefixes registered by the routers in routes/*. Anything else
# under /api/* is a bot probe -- return 404 (Apr 24 audit V5). Sending 307
# to scanners tells them the path is "interesting" and invites follow-up
# probing; worse, the previous redirect produced infinite-loop responses
# for non-existent paths because the SPA catch-all eats /api/v1/<junk>.
KNOWN_V1_PREFIXES = {
    "sources", "claims", "assist", "graph", "stats", "cache",
    "claimreview", "jobs", "disclaimer", "evidence", "verified",
}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "DELETE"], include_in_schema=False)
async def api_v1_redirect(request: Request, path: str):
    """Redirect unversioned /api/ routes to /api/v1/ for backwards compatibility.

    Only redirects when the first path segment matches a real v1 prefix; all
    other /api/* paths 404 to deny bot scanners the signal that those paths
    might exist somewhere.
    """
    first_segment = path.split("/", 1)[0] if path else ""
    if first_segment not in KNOWN_V1_PREFIXES:
        raise HTTPException(404, "Not found")
    new_url = str(request.url).replace("/api/", "/api/v1/", 1)
    return RedirectResponse(url=new_url, status_code=307)
'''

if old not in src:
    raise SystemExit('ANCHOR NOT FOUND for V5 patch')
src = src.replace(old, new, 1)
p.write_text(src)
print('OK V5 patched')
