/**
 * Smoke Test — WeThePeople API
 *
 * Quick sanity check: 1 VU, 30 seconds.
 * Verifies the API is up and responding to basic endpoints.
 *
 * Usage:
 *   k6 run tests/load/smoke.js
 *   k6 run tests/load/smoke.js --env BASE_URL=http://localhost:8006
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://api.wethepeopleforus.com";

// Custom metrics
const errorRate = new Rate("errors");
const healthDuration = new Trend("health_duration", true);
const dashboardDuration = new Trend("dashboard_stats_duration", true);
const searchDuration = new Trend("search_duration", true);

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],        // <1% errors
    http_req_duration: ["p(95)<3000"],      // p95 < 3s
    errors: ["rate<0.01"],
  },
};

export default function () {
  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  healthDuration.add(healthRes.timings.duration);
  const healthOk = check(healthRes, {
    "health: status 200": (r) => r.status === 200,
    "health: has status field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status !== undefined;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!healthOk);
  sleep(1);

  // 2. Politics dashboard stats
  const dashRes = http.get(`${BASE_URL}/politics/dashboard/stats`);
  dashboardDuration.add(dashRes.timings.duration);
  const dashOk = check(dashRes, {
    "dashboard: status 200": (r) => r.status === 200,
    "dashboard: has total_people": (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.total_people === "number";
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!dashOk);
  sleep(1);

  // 3. Search
  const searchRes = http.get(`${BASE_URL}/search?q=test`);
  searchDuration.add(searchRes.timings.duration);
  const searchOk = check(searchRes, {
    "search: status 200": (r) => r.status === 200,
    "search: has query field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.query === "test";
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!searchOk);
  sleep(1);
}

export function handleSummary(data) {
  const passed = Object.values(data.metrics).every((m) => {
    if (m.thresholds) {
      return Object.values(m.thresholds).every((t) => t.ok);
    }
    return true;
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SMOKE TEST: ${passed ? "PASSED" : "FAILED"}`);
  console.log(`${"=".repeat(60)}\n`);

  return {};
}
