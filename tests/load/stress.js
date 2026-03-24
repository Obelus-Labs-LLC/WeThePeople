/**
 * Stress Test — WeThePeople API
 *
 * Ramp from 0 to 50 VUs over 2 min, hold 3 min, ramp down over 1 min.
 * Validates system behavior under sustained heavy load.
 *
 * Pass criteria: p95 < 2000ms, error rate < 5%
 *
 * Usage:
 *   k6 run tests/load/stress.js
 *   k6 run tests/load/stress.js --env BASE_URL=http://localhost:8006
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://api.wethepeopleforus.com";

// Metrics
const errorRate = new Rate("errors");
const requestCount = new Counter("total_requests");

const healthLatency = new Trend("latency_health", true);
const politicsDashLatency = new Trend("latency_politics_dashboard", true);
const peopleLatency = new Trend("latency_people_list", true);
const financeDashLatency = new Trend("latency_finance_dashboard", true);
const influenceStatsLatency = new Trend("latency_influence_stats", true);
const searchLatency = new Trend("latency_search", true);

export const options = {
  stages: [
    { duration: "2m", target: 50 },   // Ramp up to 50 VUs
    { duration: "3m", target: 50 },   // Hold at 50 VUs
    { duration: "1m", target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],              // <5% request errors
    http_req_duration: ["p(95)<2000"],            // p95 < 2s (primary SLO)
    errors: ["rate<0.05"],
    latency_health: ["p(95)<500"],
    latency_politics_dashboard: ["p(95)<2000"],
    latency_people_list: ["p(95)<2000"],
    latency_finance_dashboard: ["p(95)<2000"],
    latency_influence_stats: ["p(95)<2000"],
    latency_search: ["p(95)<2000"],
  },
};

const ENDPOINTS = [
  {
    name: "health",
    path: "/health",
    trend: healthLatency,
    weight: 1,
    checks: { "status 200": (r) => r.status === 200 },
  },
  {
    name: "politics_dashboard_stats",
    path: "/politics/dashboard/stats",
    trend: politicsDashLatency,
    weight: 3,
    checks: {
      "status 200": (r) => r.status === 200,
      "has total_people": (r) => {
        try { return typeof JSON.parse(r.body).total_people === "number"; }
        catch { return false; }
      },
    },
  },
  {
    name: "people_list",
    path: "/people?limit=20",
    trend: peopleLatency,
    weight: 3,
    checks: {
      "status 200": (r) => r.status === 200,
    },
  },
  {
    name: "finance_dashboard_stats",
    path: "/finance/dashboard/stats",
    trend: financeDashLatency,
    weight: 2,
    checks: {
      "status 200": (r) => r.status === 200,
    },
  },
  {
    name: "influence_stats",
    path: "/influence/stats",
    trend: influenceStatsLatency,
    weight: 2,
    checks: {
      "status 200": (r) => r.status === 200,
    },
  },
  {
    name: "search",
    path: "/search?q=pfizer",
    trend: searchLatency,
    weight: 3,
    checks: {
      "status 200": (r) => r.status === 200,
      "has results": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.query === "pfizer";
        } catch { return false; }
      },
    },
  },
];

/**
 * Weighted random endpoint selection to simulate realistic traffic.
 * Dashboard and search get hit more often than health checks.
 */
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

    const ok = check(res, ep.checks);
    errorRate.add(!ok);
  });

  // Simulate user think time: 0.3-1.5s between requests
  sleep(0.3 + Math.random() * 1.2);
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
  console.log(`  STRESS TEST: ${allPassed ? "PASSED" : "FAILED"}`);
  console.log(`${"=".repeat(60)}`);

  for (const [name, result] of Object.entries(thresholdResults)) {
    const icon = result === "PASS" ? "+" : "!";
    console.log(`  [${icon}] ${name}: ${result}`);
  }

  // Print summary stats
  const httpDuration = data.metrics.http_req_duration;
  if (httpDuration && httpDuration.values) {
    console.log(`\n  Request duration:`);
    console.log(`    median: ${httpDuration.values.med?.toFixed(0) || "N/A"}ms`);
    console.log(`    p90:    ${httpDuration.values["p(90)"]?.toFixed(0) || "N/A"}ms`);
    console.log(`    p95:    ${httpDuration.values["p(95)"]?.toFixed(0) || "N/A"}ms`);
    console.log(`    max:    ${httpDuration.values.max?.toFixed(0) || "N/A"}ms`);
  }

  const totalReqs = data.metrics.total_requests;
  if (totalReqs && totalReqs.values) {
    console.log(`  Total requests: ${totalReqs.values.count || 0}`);
  }

  console.log("");
  return {};
}
