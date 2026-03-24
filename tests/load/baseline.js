/**
 * Baseline Load Test — WeThePeople API
 *
 * Steady load: 10 VUs for 2 minutes against main read endpoints.
 * Establishes performance baseline for normal traffic patterns.
 *
 * Usage:
 *   k6 run tests/load/baseline.js
 *   k6 run tests/load/baseline.js --env BASE_URL=http://localhost:8006
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://api.wethepeopleforus.com";

// Custom metrics per endpoint
const errorRate = new Rate("errors");
const requestCount = new Counter("total_requests");

const healthLatency = new Trend("latency_health", true);
const politicsDashLatency = new Trend("latency_politics_dashboard", true);
const peopleLatency = new Trend("latency_people_list", true);
const financeDashLatency = new Trend("latency_finance_dashboard", true);
const influenceStatsLatency = new Trend("latency_influence_stats", true);
const searchLatency = new Trend("latency_search", true);

export const options = {
  vus: 10,
  duration: "2m",
  thresholds: {
    http_req_failed: ["rate<0.05"],          // <5% errors
    http_req_duration: ["p(95)<3000"],        // p95 < 3s
    errors: ["rate<0.05"],
    latency_health: ["p(95)<500"],
    latency_politics_dashboard: ["p(95)<2000"],
    latency_people_list: ["p(95)<2000"],
    latency_finance_dashboard: ["p(95)<2000"],
    latency_influence_stats: ["p(95)<3000"],
    latency_search: ["p(95)<2000"],
  },
};

const ENDPOINTS = [
  {
    name: "health",
    path: "/health",
    trend: healthLatency,
    checks: {
      "status 200": (r) => r.status === 200,
    },
  },
  {
    name: "politics_dashboard_stats",
    path: "/politics/dashboard/stats",
    trend: politicsDashLatency,
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
    checks: {
      "status 200": (r) => r.status === 200,
      "returns array or object": (r) => {
        try { const b = JSON.parse(r.body); return Array.isArray(b) || typeof b === "object"; }
        catch { return false; }
      },
    },
  },
  {
    name: "finance_dashboard_stats",
    path: "/finance/dashboard/stats",
    trend: financeDashLatency,
    checks: {
      "status 200": (r) => r.status === 200,
    },
  },
  {
    name: "influence_stats",
    path: "/influence/stats",
    trend: influenceStatsLatency,
    checks: {
      "status 200": (r) => r.status === 200,
    },
  },
  {
    name: "search_pfizer",
    path: "/search?q=pfizer",
    trend: searchLatency,
    checks: {
      "status 200": (r) => r.status === 200,
      "has query field": (r) => {
        try { return JSON.parse(r.body).query === "pfizer"; }
        catch { return false; }
      },
    },
  },
];

export default function () {
  // Each VU cycles through all endpoints per iteration
  for (const ep of ENDPOINTS) {
    group(ep.name, function () {
      const res = http.get(`${BASE_URL}${ep.path}`);
      ep.trend.add(res.timings.duration);
      requestCount.add(1);

      const ok = check(res, ep.checks);
      errorRate.add(!ok);
    });

    // Brief pause between requests to simulate realistic browsing
    sleep(0.5 + Math.random() * 1.0);
  }
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
  console.log(`  BASELINE TEST: ${allPassed ? "PASSED" : "FAILED"}`);
  console.log(`${"=".repeat(60)}`);

  for (const [name, result] of Object.entries(thresholdResults)) {
    console.log(`  ${result === "PASS" ? "✓" : "✗"} ${name}: ${result}`);
  }
  console.log("");

  return {};
}
