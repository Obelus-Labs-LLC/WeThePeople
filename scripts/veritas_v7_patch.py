"""V7: Stop emitting synthetic ts_start/ts_end on /claims/extract responses.

The /extract endpoint converted plain text into pseudo-segments with
fabricated durations (`len(line) / 20.0`) just to satisfy the Segment
type. Those bogus timestamps then leaked into the response as
ts_start/ts_end, looking like real video timestamps to consumers.

Fix:
  - Build the synthetic segments with ts=0.0/0.0 so the data is
    explicit instead of fabricated.
  - Strip ts_start/ts_end from the /extract response dicts so callers
    don't see meaningless 0.0 fields either. Real video-derived claims
    via /sources keep their timestamps untouched.

Idempotent.
"""
from pathlib import Path

p = Path('/home/dshon/veritas-service/src/veritas/routes/claims.py')
src = p.read_text()

if 'V7-applied' in src:
    print('Already patched.')
    raise SystemExit(0)

old_segments = '''    # Convert text to pseudo-segments
    lines = input.text.split("\\n")
    segments = []
    offset = 0.0
    for line in lines:
        line = line.strip()
        if len(line) > 10:
            duration = max(5.0, len(line) / 20.0)
            segments.append(Segment(start=offset, end=offset + duration, text=line))
            offset += duration'''
new_segments = '''    # V7-applied: build pseudo-segments without fake durations. The
    # /extract endpoint has no notion of time -- claims here are derived
    # from prose, not from a transcript -- so emitting len(line)/20.0
    # second timestamps was just lying to consumers (Apr 24 audit V7).
    # Use 0.0/0.0 and strip the fields from the response below.
    lines = input.text.split("\\n")
    segments = []
    for line in lines:
        line = line.strip()
        if len(line) > 10:
            segments.append(Segment(start=0.0, end=0.0, text=line))'''

if old_segments not in src:
    raise SystemExit('SEGMENT BLOCK ANCHOR NOT FOUND')
src = src.replace(old_segments, new_segments, 1)

old_return = '''    return {
        "claims": [_claim_to_dict(c) for c in claims],
        "count": len(claims),
    }'''
new_return = '''    claim_dicts = [_claim_to_dict(c) for c in claims]
    # V7: ts_start / ts_end are meaningless for prose-derived claims.
    # Drop them so consumers don't get false-precision timestamps.
    for d in claim_dicts:
        d.pop("ts_start", None)
        d.pop("ts_end", None)
    return {
        "claims": claim_dicts,
        "count": len(claim_dicts),
    }'''
if old_return not in src:
    raise SystemExit('RETURN BLOCK ANCHOR NOT FOUND')
src = src.replace(old_return, new_return, 1)

p.write_text(src)
print('OK V7 patched')
