# Phase 3 sketch

Phase 1 was the data + verification engine. Phase 2 was audience-fit
(personalization, alerts, contributor inbox, the full reader-onto-
ramp). Phase 3 is the piece that turns reading into civic action with
durable feedback loops.

This is a sketch, not a plan. Pick a thread, then plan that thread.

## Operating premises (what Phase 2 made true)

- Logged-in readers carry sectors, concerns, and a watchlist into
  every page. The recommendation surface (Action Panel, Why This
  Matters, alerts, digest) is wired end-to-end.
- Anonymous readers get the same personalization via localStorage.
  When they later log in the cookie syncs the state to the backend.
- Tips inbox is open at journal.wethepeopleforus.com/tip with
  /ops/tips moderation. Editor email fires on every submission.
- The story pipeline auto-seeds Action Panel content at approve
  time. New stories ship with concrete next steps without manual
  curation.
- Bill-action alerts already fire when a watchlisted bill moves.
  Sector follow means a reader can opt into a whole topic, not
  just specific entities.

What we still don't have: a way to know whether any of this changed
anyone's behavior. Phase 3 is the loop.

## Phase 3 thesis

Get from "readers know" to "readers act, and we know what worked."

Three threads. Each can stand alone; they reinforce each other.

### Thread A — Outcome tracking

The Action Panel ships a CTA. We don't know if anyone clicked. We
don't know if anyone called their rep. We don't know which scripts
worked.

Concrete pieces:
- Click tracking on every Action Panel CTA (passive, no PII).
  Aggregate counts go on /ops dashboard cards.
- "Did you take this action?" one-tap follow-up on the next visit.
  Lightweight survey, signed-in only.
- Per-script effectiveness: when a user copies a call_rep script
  and we later detect a related vote, surface the correlation.
  Editorial uses this to tune which scripts get rotated up.

Hard part: nothing here can be invasive. The disengaged-audience
thesis dies the moment readers feel surveilled. Every click signal
must be visible to the user (privacy page lists what we collect)
and disengageable.

### Thread B — Civic outcomes panel

Right now a story drops, lives on the Journal, and that's it. Phase
3 adds an "Outcome" panel that updates as the underlying situation
evolves.

Concrete pieces:
- Each story carries an outcome_state (open / improved / worsened /
  resolved) updated by the pipeline when relevant new data lands.
  E.g., a contract-windfall story for company X marks "worsened"
  if X's penalties drop AND lobbying spend rises.
- The /story page renders a thin status bar at the top: "As of
  [date], [outcome]. Last update [link to BillAction/Anomaly]."
- The Action Panel hides actions that are no longer applicable
  (a register-to-vote action stays universal; a "call about HR
  1234" hides once the bill is enacted or dies in committee).
- A new /outcomes page lists every story by status. Filterable by
  sector + concern. Surfaces the wins ("4 stories resolved this
  quarter"), which is the morale carrier the project currently
  lacks.

Hard part: outcome detection is per-story-shape work. Stock-trade
stories, contract stories, lobbying stories each need a different
heuristic. Probably starts with the 3-4 highest-traffic categories
and expands.

### Thread C — Local civic graph

We track Congress. State legislatures, school boards, city councils
are where most readers' lives actually intersect with policy. Phase
3 starts the local layer.

Concrete pieces:
- Pull state-level bills (OpenStates already in the codebase) and
  surface them on the existing /politics page filtered by user's
  home_state.
- Local rep + committee data (existing /politics/people endpoint
  takes person_id; expand to state legislators).
- Sector tagging on state bills so the alert system catches them.
  A reader who follows "housing" should be alerted when their
  state assembly takes up rent control, not only when Congress
  does.
- Civic Hub gets per-state landing pages (e.g., /civic/MI) listing
  local promises + proposals scoped to the user's location.

Hard part: data quality. OpenStates is uneven across states; some
have great APIs, some have PDFs. Cap initial scope to the 10
largest states by population and grow.

## What we need before Phase 3 kickoff

- Outcome data infrastructure: a `story_outcomes` table with
  state, last_signal_at, signal_source. (Migration sketch only;
  not built yet.)
- Click-tracking endpoint: `POST /events/action-click` with
  story_id + action_id. Rate-limited, anonymized.
- Telemetry dashboard at /ops/engagement showing aggregate
  click-through, follow rate, alert open rate.

## What's deliberately out of scope

- Personalized story bodies (LLM-generated per-reader prose).
  Tested in Phase 2, not enabled by default. The 60-second
  simplified toggle is the limit; deeper per-reader rewrites
  break the editorial trail.
- Push notifications. Email + in-page is the bar. Push needs a
  PWA install prompt that erodes the disengaged-audience thesis.
- Advertiser-facing surfaces. Ad-free is a pillar; revenue
  threads come through subscriptions and grants.

## Decision points before planning

1. Which thread first?
   - A is the smallest scope and gives us the data Phase 3 needs.
   - B is the most user-visible and gives the project its narrative.
   - C is the biggest but most differentiated.
2. Outcomes for which categories first?
3. Local data: OpenStates only, or layer Ballotpedia / scraped
   sources too?

A separate /gsd:plan-phase pass runs once a thread is picked.
