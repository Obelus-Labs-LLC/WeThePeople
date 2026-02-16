import React, { useState, useEffect } from "react";
import { getPressApiKey, setPressApiKey, hasPressApiKey, getApiBaseUrl } from "../api/client";

const API_BASE = getApiBaseUrl();

const PressToolsPage: React.FC = () => {
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(hasPressApiKey);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<Record<string, unknown> | null>(null);

  // Validate key on entry
  const handleSubmitKey = async () => {
    if (!keyInput.trim()) return;
    setValidating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/ops/runtime`, {
        headers: { "X-WTP-API-KEY": keyInput.trim() },
      });
      if (res.status === 401) {
        setError("Invalid API key. Please check your key and try again.");
        setValidating(false);
        return;
      }
      if (!res.ok) {
        setError(`Server error (${res.status}). The API may be unavailable.`);
        setValidating(false);
        return;
      }
      // Key works — save it
      setPressApiKey(keyInput.trim());
      setHasKey(true);
      const data = await res.json();
      setRuntimeInfo(data);
    } catch {
      setError("Could not connect to the API. Check your network connection.");
    }
    setValidating(false);
  };

  const handleClearKey = () => {
    setPressApiKey("");
    setHasKey(false);
    setRuntimeInfo(null);
    setKeyInput("");
  };

  // Load runtime info if key exists
  useEffect(() => {
    if (!hasKey) return;
    const key = getPressApiKey();
    fetch(`${API_BASE}/ops/runtime`, {
      headers: { "X-WTP-API-KEY": key },
    })
      .then((r) => {
        if (r.status === 401) {
          // Key expired or invalid
          handleClearKey();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setRuntimeInfo(data);
      })
      .catch(() => {});
  }, [hasKey]);

  if (!hasKey) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="rounded-2xl bg-white border border-stone-200 p-8 shadow-sm text-center">
          <div className="h-14 w-14 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-white font-black">P</span>
          </div>
          <h1 className="text-xl font-bold text-stone-900 mb-2">Press Tools</h1>
          <p className="text-sm text-stone-500 mb-6">
            Access claims analysis, matching evidence, coverage reports, and
            other journalistic tools. Enter your API key to continue.
          </p>

          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitKey()}
              placeholder="Paste your API key"
              className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleSubmitKey}
              disabled={validating || !keyInput.trim()}
              className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {validating ? "Checking..." : "Connect"}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="mt-6 text-xs text-stone-400">
            Need a key? Contact the WeThePeople team for press access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Press Tools</h1>
          <p className="text-sm text-stone-500 mt-1">
            Claims analysis, matching evidence, and coverage tools.
          </p>
        </div>
        <button
          onClick={handleClearKey}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {/* Runtime info */}
      {runtimeInfo && (
        <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-stone-900 mb-3">API Runtime</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {Object.entries(runtimeInfo).slice(0, 10).map(([key, val]) => (
              <div key={key} className="flex gap-2">
                <dt className="text-stone-500 whitespace-nowrap">{key}:</dt>
                <dd className="text-stone-800 truncate">{String(val)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Quick links to press-tier tools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ToolCard
          title="Claims Browser"
          description="Browse and search all extracted claims across tracked members."
          href={`${API_BASE}/claims?limit=20`}
        />
        <ToolCard
          title="Coverage Report"
          description="See pipeline coverage — which members have data and which need attention."
          href={`${API_BASE}/ops/coverage`}
        />
        <ToolCard
          title="Claim Evaluation"
          description="View detailed evidence receipts for individual claims."
          note="Use /claims/{id}/evaluation"
        />
      </div>

      <div className="rounded-xl bg-stone-100 border border-stone-200 p-6">
        <p className="text-sm text-stone-600">
          <strong>Tip:</strong> All press-tier API endpoints require the{" "}
          <code className="bg-white px-1.5 py-0.5 rounded text-xs">X-WTP-API-KEY</code> header.
          Your key is stored in this browser's localStorage and sent automatically
          when using the API client.
        </p>
      </div>
    </div>
  );
};

const ToolCard: React.FC<{
  title: string;
  description: string;
  href?: string;
  note?: string;
}> = ({ title, description, href, note }) => (
  <div className="rounded-xl bg-white border border-stone-200 p-5 shadow-sm">
    <h3 className="text-sm font-semibold text-stone-900 mb-1">{title}</h3>
    <p className="text-xs text-stone-500 mb-3">{description}</p>
    {href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        Open API endpoint &rarr;
      </a>
    ) : note ? (
      <span className="text-xs text-stone-400">{note}</span>
    ) : null}
  </div>
);

export default PressToolsPage;
