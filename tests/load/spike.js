/**
 * Spike Test — WeThePeople API
 *
 * Sudden jump to 100 VUs for 30 seconds to find the breaking point.
 * Ramp: 0 -> 100 in 10s, hold 30s, ramp down 10s.
 *
 * This test is intentionally aggressive. It measures:
 * - How the system handles sudden traffic spikes
 * - Whether SQLite locking causes cascading failures
 * - Recovery time after spike subsides
 * - Whether the rate limiter (slowapi, 5 req/s per IP) kicks in
 *
 * Usage:
 *   k6 run tests/load/spike.js
 *   k6 run tests/load/spike.js --env BASE_URL=http://localhost:8006
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://api.wethepeopleforus.com";

// Metrics
const errorRate = new Rate("errors");
const rateLimitRate = new Rate("rate_limited");
const requestCount = new Counter("total_requests");

const healthLatency = new Trend("latency_health", true);
const politicsDashLatency = new Trend("latency_politics_dashboard", true);
const peopleLatency = new Trend("latency_people_list", true);
const financeDashLatency = new Trend("latency_finance_dashboard", true);
const influenceStatsLatency = new Trend("latency_influence_stats", true);
const searchLatency = new Trend("latency_search", true);

export const options = {
  stages: [
    { duration: "10s", target: 100 },  // Spike up to 100 VUs
    { duration: "30s", target: 100 },  // Hold at 100 VUs
    { duration: "10s", target: 0 },    // Ramp down
  ],
  thresholds: {
    // Looser thresholds — spike test is about finding limits, not SLO compliance
    http_req_failed: ["rate<0.30"],              // Allow up to 30% failure during spike
    http_req_duration: ["p(95)<5000"],            // p95 < 5s (relaxed)
    errors: ["rate<0.30"],
  },
};

const ENDPOINTS = [
  { name: "health", path: "/health", trend: healthLatency, weight: 1 },
  { name: "politics_dashboard_stats", path: "/politics/dashboard/stats", trend: politicsDashLatency, weight: 3 },
  { name: "people_list", path: "/people?limit=20", trend: peopleLatency, weight: 3 },
  { name: "finance_dashboard_stats", path: "/finance/dashboard/stats", trend: financeDashLatency, weight: 2 },
  { name: "influence_stats", path: "/influence/stats", trend: influenceStatsLatency, weight: 2 },
  { name: "search", path: "/search?q=pfizer", trend: searchLatency, weight: 3 },
];

function pickEndpoint() {
  const totalWeight = ENDPOINTS.reduce((sum, ep) => sum + ep.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const ep of ENDPOINTS) {
    rand -= ep.weight;
    if (rand <= 0) return ep;
  }
  return ENDPOINTS[ENDPOINTS.length - 1];
}

export default function () {
  const ep = pickEndpoint();

  group(ep.name, function () {
    const res = http.get(`${BASE_URL}${ep.path}`);
    ep.trend.add(res.timings.duration);
    requestCount.add(1);

    // Track rate limiting separately from errors
    if (res.status === 429) {
      rateLimitRate.add(1);
      // Rate-limited responses are expected during spikes, don't count as errors
      return;
    }

    rateLimitRate.add(0);

    const ok = check(res, {
      "status is success": (r) => r.status >= 200 && r.status < 400,
    });
    errorRate.add(!ok);
  });

  // Minimal sleep to maximize pressure
  sleep(0.1 + Math.random() * 0.3);
}

export function handleSummary(data) {
  const thresholdResults = {};
  let allPassed = true;

  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.thresholds) {
      for (const [threshold, result] of Object.entries(metric.thresholds)) {
        thresholdResults[`${name} [${threshold}]`] = result.ok ? "PASS" : "FAIL";
        if (!result.ok) allPassed = false;
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SPIKE TEST: ${allPassed ? "SURVIVED" : "BREAKING POINT FOUND"}`);
  console.log(`${"=".repeat(60)}`);

  for (const [name, result] of Object.entries(thresholdResults)) {
    const icon = result === "PASS" ? "+" : "!";
    console.log(`  [${icon}] ${name}: ${result}`);
  }

  // Detailed breakdown
  const httpDuration = data.metrics.http_req_duration;
  if (httpDuration && httpDuration.values) {
    console.log(`\n  Request duration under spike:`);
    console.log(`    median: ${httpDuration.values.med?.toFixed(0) || "N/A"}ms`);
    console.log(`    p90:    ${httpDuration.values["p(90)"]?.toFixed(0) || "N/A"}ms`);
    console.log(`    p95:    ${httpDuration.values["p(95)"]?.toFixed(0) || "N/A"}ms`);
    console.log(`    p99:    ${httpDuration.values["p(99)"]?.toFixed(0) || "N/A"}ms`);
    console.log(`    max:    ${httpDuration.values.max?.toFixed(0) || "N/A"}ms`);
  }

  const totalReqs = data.metrics.total_requests;
  if (totalReqs && totalReqs.values) {
    console.log(`  Total requests: ${totalReqs.values.count || 0}`);
  }

  const rl = data.metrics.rate_limited;
  if (rl && rl.values) {
    const rlPct = ((rl.values.rate || 0) * 100).toFixed(1);
    console.log(`  Rate-limited: ${rlPct}%`);
  }

  const errMetric = data.metrics.errors;
  if (errMetric && errMetric.values) {
    const errPct = ((errMetric.values.rate || 0) * 100).toFixed(1);
    console.log(`  Error rate (excl. 429): ${errPct}%`);
  }

  console.log("");
  return {};
}
