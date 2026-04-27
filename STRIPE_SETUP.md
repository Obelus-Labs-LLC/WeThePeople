# Stripe setup for Veritas pricing

Step-by-step to wire the four paid tiers (Student / Pro / Newsroom /
Enterprise) into Stripe so `POST /auth/checkout` actually works on
production. The backend code, webhook handler, and pricing page are
already shipped — what remains is the Stripe-dashboard side: create the
products, copy the price IDs into the Hetzner `.env`, and turn on
Stripe Tax + the webhook.

Estimated time: **20–30 minutes**.

---

## Pre-flight

You should already have:

- A Stripe account in **live mode** (not test mode).
- The existing `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` env vars
  set in `/home/dshon/wethepeople-backend/.env` on the Hetzner server.
- The existing `STRIPE_WEBHOOK_SECRET` env var set there too. (If
  you've never run an enterprise checkout, the webhook may not be
  pointed at WTP yet — see Step 5.)

You can verify by SSH'ing in and running:

```bash
ssh dshon@138.199.214.174 'grep -E "^STRIPE_" /home/dshon/wethepeople-backend/.env | sed "s/=.*/=<set>/"'
```

If `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are present, you're
fine.

---

## Step 1 — Turn on Stripe Tax

1. Go to **Stripe Dashboard → Settings → Tax**.
2. Click **Activate Tax**.
3. Stripe will ask you to confirm your business address and origin
   tax registrations. For US-based Obelus Labs LLC, the minimum is
   your state of registration; you can add states as nexus thresholds
   are crossed.
4. Confirm. The backend code already passes `automatic_tax: { enabled: true }`
   on every checkout session — Stripe handles the rest.

This is what lets us legally collect (and remit) state sales tax / EU
VAT without writing tax logic ourselves.

---

## Step 2 — Create products

For each of the four paid tiers, create a Stripe **Product** with two
recurring **Prices** (one monthly, one annual). The annual price
should be 10× the monthly price (so 12 months gives a ~17% discount).

**Stripe Dashboard → Product Catalog → Add product.**

| # | Product name | Description | Tax category |
|---|---|---|---|
| 1 | `WeThePeople Student` | "50 Veritas verifications per day. .edu email required." | Software as a service |
| 2 | `WeThePeople Pro` | "200 Veritas verifications per day. For independent journalists, podcasters, researchers." | Software as a service |
| 3 | `WeThePeople Newsroom` | "1,000 Veritas verifications per day, pooled across up to 5 seats. Local + regional newsrooms." | Software as a service |
| 4 | `WeThePeople Enterprise` | "Unlimited Veritas verifications, SLA + dedicated support, custom onboarding." | Software as a service |

For each product, add prices:

| Product | Monthly price | Annual price |
|---|---|---|
| Student | $5.00 USD | $50.00 USD |
| Pro | $19.00 USD | $190.00 USD |
| Newsroom | $99.00 USD | $990.00 USD |
| Enterprise | $999.00 USD | (skip — annual is hand-sold) |

**For each price, set:**

- **Pricing model:** Standard
- **Billing period:** Monthly or Yearly accordingly
- **Type:** Recurring
- Tax behavior: **Exclusive** (tax added on top — preferred for B2B
  software). If your audience is mostly consumer, switch to Inclusive.

After saving each price, copy its ID — they look like `price_1Pxxxx…`.

---

## Step 3 — Copy price IDs into the Hetzner `.env`

SSH to Hetzner:

```bash
ssh dshon@138.199.214.174
cd /home/dshon/wethepeople-backend
nano .env
```

Append the following lines, substituting in the price IDs you copied:

```
# --- Veritas tier price IDs (Stripe live mode) ---
STRIPE_WTP_STUDENT_MONTHLY_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WTP_STUDENT_ANNUAL_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WTP_PRO_MONTHLY_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WTP_PRO_ANNUAL_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WTP_NEWSROOM_MONTHLY_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WTP_NEWSROOM_ANNUAL_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WTP_ENTERPRISE_PRICE_ID=price_xxxxxxxxxxxx
```

Save and exit. Then:

```bash
sudo systemctl restart wethepeople
sudo systemctl is-active wethepeople    # should print "active"
```

---

## Step 4 — Sanity check from the API

```bash
curl -s https://api.wethepeopleforus.com/auth/pricing | python3 -m json.tool | head -40
```

You should see the five tiers (`free`, `student`, `pro`, `newsroom`,
`enterprise`) with the prices baked into `services/rbac.py`'s
`TIER_DISPLAY` table — these come from the code, not from Stripe, so
the page renders even before any price IDs are set.

To test that a checkout session actually mints, register a test
account, log in, and POST:

```bash
TOKEN="<your access_token from /auth/login>"
curl -s -X POST https://api.wethepeopleforus.com/auth/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan":"pro","billing":"monthly"}'
```

Expected response:

```json
{"checkout_url":"https://checkout.stripe.com/c/pay/cs_live_...","plan":"pro","billing":"monthly"}
```

If you see `"detail":"Plan 'pro/monthly' not yet configured (missing STRIPE_WTP_PRO_MONTHLY_PRICE_ID)"`,
the env var didn't load — re-check the `.env` and the systemctl
restart.

If you see `"detail":"Payment system not configured"`, the
`STRIPE_SECRET_KEY` is missing.

If you see `"detail":{"error":"edu_required",...}` while testing the
`student` plan, that's correct — your account email must end in `.edu`
or `.ac.<tld>` for the student plan to allow checkout.

---

## Step 5 — Configure the webhook

The webhook is what flips a user's role from `free` to `pro` /
`newsroom` / etc. when their checkout completes.

1. **Stripe Dashboard → Developers → Webhooks → Add endpoint.**
2. **Endpoint URL:** `https://api.wethepeopleforus.com/auth/webhook/stripe`
3. **Events to listen to:**
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
   - `invoice.payment_failed`
4. Save. Stripe will show you the signing secret (starts with `whsec_…`).
5. Copy that secret. SSH to Hetzner and add / update in `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxx
   ```
6. Restart the API:
   ```bash
   sudo systemctl restart wethepeople
   ```

**Verify the webhook works** by clicking **Send test webhook** in
Stripe → pick `checkout.session.completed` → send. The Stripe
dashboard will show whether the API responded with 200. If it 400s
on signature, the webhook secret is wrong.

---

## Step 6 — End-to-end smoke test

1. Open https://wethepeopleforus.com/pricing
2. Toggle Monthly / Annual — prices should swap.
3. Click **Choose Pro** while logged out — should redirect to /login.
4. Log in, click **Choose Pro** again — should land you on Stripe Checkout.
5. (Optional, requires test card) Use Stripe's test card flow once at
   least, then check the user's role in the DB:
   ```bash
   ssh dshon@138.199.214.174 'cd /home/dshon/wethepeople-backend && /home/dshon/wethepeople-backend/.venv/bin/python -c "
   from models.database import SessionLocal
   from models.auth_models import User
   db = SessionLocal()
   u = db.query(User).filter(User.email == \"YOUR_TEST_EMAIL\").first()
   print(\"role:\", u.role)
   "'
   ```
   The role should now be `pro` (or whatever plan you chose).
6. Hit https://verify.wethepeopleforus.com — the QuotaBadge should show
   "X of 200 today" (Pro tier limit).

---

## Step 7 — Promo codes (optional)

The checkout endpoint already passes `allow_promotion_codes: true`, so
any promo codes you create in Stripe (Dashboard → Product Catalog →
Coupons) will be accepted at the Checkout page. Use this for:

- **Student verification fallback:** if a non-.edu email needs the
  student rate (alumni, international students, faculty advisors), mint
  a single-use promo code reducing Pro to $5/mo.
- **Launch discounts:** "FOUNDERS50" for the first 100 signups.
- **Comp accounts:** 100% off for press contacts you want to give free
  Pro access.

Promo codes are tracked in Stripe; they don't need any code changes.

---

## Step 8 — When you add a future tier

Edit `services/rbac.py` (already-shipped):

1. Add the role to `ROLE_HIERARCHY` and `ROLE_RATE_LIMITS`.
2. Add the metadata to `TIER_DISPLAY`.

Edit `routers/auth.py`:

3. Add the new `(plan, billing)` rows to `PLAN_PRICES`, pointing at
   new env vars.

Then create the Stripe product + price, add the env var, restart.
The Pricing page picks up the new tier automatically because it reads
from `/auth/pricing`.

---

## Things to watch in production

- **Failed-payment downgrades.** When a card fails for too long
  (`invoice.payment_failed` → eventually `customer.subscription.deleted`),
  the webhook drops the user back to `free`. Watch the Resend / email
  side: we send the dunning emails, but if Stripe's are turned off and
  ours are misfiring, the user is silently ejected.
- **Webhook retries.** Stripe retries failed webhook deliveries for 3
  days. If the API was down during a real upgrade, Stripe will replay
  it once the API is back. The `checkout.session.completed` handler is
  idempotent (it sets the same role each time), so this is safe.
- **Tax thresholds.** Stripe Tax flags when you cross a state-nexus
  threshold (typically $100K + 200 transactions) and recommends
  registering. Don't ignore those emails.
- **Annual renewals.** A user on annual is locked in for 12 months. If
  they downgrade mid-term, you generally honor the existing tier until
  renewal. The webhook sets role to `free` only on the
  `subscription.deleted` (final cancellation), not on prorated changes.

---

## Quick reference: env vars touched by this rollout

```bash
# Already set:
STRIPE_SECRET_KEY           # from your Stripe dashboard
STRIPE_PUBLISHABLE_KEY      # from your Stripe dashboard
STRIPE_WEBHOOK_SECRET       # from Stripe → Webhooks → endpoint signing secret
STRIPE_WTP_ENTERPRISE_PRICE_ID  # legacy enterprise price ID

# New (Step 3):
STRIPE_WTP_STUDENT_MONTHLY_PRICE_ID
STRIPE_WTP_STUDENT_ANNUAL_PRICE_ID
STRIPE_WTP_PRO_MONTHLY_PRICE_ID
STRIPE_WTP_PRO_ANNUAL_PRICE_ID
STRIPE_WTP_NEWSROOM_MONTHLY_PRICE_ID
STRIPE_WTP_NEWSROOM_ANNUAL_PRICE_ID
```
