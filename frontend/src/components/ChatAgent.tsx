import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { askQuestion, getRemainingQuestions, type ChatResponse, type ChatAction } from "../api/chat";
import { globalSearch, type SearchResults } from "../api/search";

// ── FAQ map (Tier 1 — free, no API call) ──

const FAQ: Record<string, string> = {
  "what data sources": "We pull from 35+ government APIs including Congress.gov, Senate LDA (lobbying), USASpending.gov (contracts), FEC (donations), SEC EDGAR (filings), SAM.gov (contractor data), Regulations.gov (regulatory comments), IT Dashboard (federal IT investments), OpenFDA, ClinicalTrials.gov, NHTSA, EPA GHGRP, PatentsView, and more. Visit our methodology page for the full list.",
  "how often updated": "Most data syncs daily via our automated scheduler. Congressional trades update within 24-48 hours of disclosure. Lobbying data updates quarterly when new Senate LDA filings are published.",
  "what sectors": "We track 11 sectors: Politics, Finance, Health, Technology, Energy, Transportation, Defense, Chemicals, Agriculture, Telecommunications, and Education. Each sector has lobbying, contracts, and enforcement data linked to political activity.",
  "how does verification work": "Our claim verification pipeline extracts claims from text, matches them against 9 data sources (votes, trades, lobbying, contracts, enforcement, donations, committees, SEC filings), and scores them as Strong, Moderate, Weak, or Unverified.",
  "how many politicians": "We track 547 members of Congress including all current senators and representatives, with their voting records, stock trades, committee memberships, and campaign donations.",
  "how many companies": "We track over 1,000 entities across 11 sectors including Finance, Health, Technology, Energy, Transportation, Defense, Chemicals, Agriculture, Telecommunications, and Education.",
  "what is this": "WeThePeople is a civic transparency platform that tracks how corporations lobby Congress, win government contracts, face enforcement actions, and donate to politicians. Our goal is to help you follow the money from industry to politics.",
  "who built this": "WeThePeople was built by Obelus Labs LLC as an open-source civic transparency tool. The source code is available on GitHub.",
  "is this free": "Yes, WeThePeople is completely free to use. The platform is open-source and funded through GitHub Sponsors.",
  "what are congressional trades": "Congressional trades are stock transactions made by members of Congress. Under the STOCK Act, lawmakers must disclose trades within 45 days. We track over 4,600 trades and flag potential conflicts of interest.",
  "what is lobbying": "Lobbying is when companies and organizations spend money to influence legislation. We track lobbying disclosures from the Senate LDA database, showing how much each company spends and which bills they target.",
  "what are enforcement actions": "Enforcement actions are regulatory penalties and investigations against companies by agencies like the FTC, SEC, FDA, and EPA. We track these to show how companies face consequences for violations.",
  "what is the influence network": "The influence network is an interactive graph showing connections between politicians and companies through donations, lobbying, stock trades, legislation, and government contracts.",
  "what is the spending map": "The spending map is a choropleth visualization showing political donations, lobbying spend, and congressional representation by state.",
  "what is money flow": "The money flow page shows Sankey diagrams tracing how money moves from companies through lobbying and PAC donations to specific politicians.",
  "how do i verify a claim": "Go to the Verify section, paste text containing political claims, select the entity being discussed, and our AI pipeline will check each claim against the legislative record.",
};

// ── Navigation intent matching (Tier 1) ──

interface IntentResult {
  answer?: string;
  action?: ChatAction;
}

const NAV_PATTERNS: Array<{ pattern: RegExp; path: string; label: string }> = [
  { pattern: /\b(trades?|stock trades?|congressional trades?)\b/i, path: "/politics/trades", label: "Congressional Trades" },
  { pattern: /\b(spending map|map|choropleth)\b/i, path: "/influence/map", label: "Spending Map" },
  { pattern: /\b(influence network|network graph)\b/i, path: "/influence/network", label: "Influence Network" },
  { pattern: /\b(money flow|sankey)\b/i, path: "/influence/money-flow", label: "Money Flow" },
  { pattern: /\b(data story|story)\b/i, path: "/influence/story", label: "Data Story" },
  { pattern: /\b(data explorer|explorer)\b/i, path: "/influence/explorer", label: "Data Explorer" },
  { pattern: /\b(influence timeline)\b/i, path: "/influence/timeline", label: "Influence Timeline" },
  { pattern: /\b(closed loop|closed-loop)\b/i, path: "/influence/closed-loops", label: "Closed Loop Detection" },
  // verify.* lives on its own subdomain now; same for the research tools.
  { pattern: /\b(verify|verification|claim)\b/i, path: "https://verify.wethepeopleforus.com", label: "Verify Claims" },
  { pattern: /\b(methodology|data sources?|how.*collect)\b/i, path: "/methodology", label: "Methodology" },
  { pattern: /\b(find.*(rep|representative)|my.*(rep|representative)|who represents)\b/i, path: "/politics/find-rep", label: "Find Your Representative" },
  { pattern: /\b(committees?)\b/i, path: "/politics/committees", label: "Committees" },
  { pattern: /\b(legislation|bills?|bill tracker)\b/i, path: "/politics/legislation", label: "Legislation Tracker" },
  { pattern: /\b(balance of power)\b/i, path: "/politics", label: "Politics Dashboard" },
  { pattern: /\b(state explorer|states)\b/i, path: "/politics/states", label: "State Explorer" },
  // The /finance, /health, /technology research tools migrated to the
  // research subdomain. Linking to the in-app paths now redirects via
  // MovedToResearchPage; point chat directly at the canonical URL.
  { pattern: /\b(insider trad(es?|ing))\b/i, path: "https://research.wethepeopleforus.com/insider-trades", label: "Insider Trades" },
  { pattern: /\b(complaints?|cfpb)\b/i, path: "https://research.wethepeopleforus.com/complaints", label: "CFPB Complaints" },
  { pattern: /\b(drug lookup|drugs?)\b/i, path: "/health", label: "Health Dashboard" },
  { pattern: /\b(clinical trial|pipeline)\b/i, path: "https://research.wethepeopleforus.com/pipeline", label: "Clinical Trial Pipeline" },
  { pattern: /\b(fda approval)\b/i, path: "https://research.wethepeopleforus.com/fda-approvals", label: "FDA Approvals" },
  { pattern: /\b(patent)\b/i, path: "https://research.wethepeopleforus.com/patents", label: "Patent Search" },
  { pattern: /\b(about)\b/i, path: "/about", label: "About" },
  // Sector dashboards
  { pattern: /\bpolitics\s*(dashboard|home|page)?\b/i, path: "/politics", label: "Politics Dashboard" },
  { pattern: /\bfinance\s*(dashboard|home|page)?\b/i, path: "/finance", label: "Finance Dashboard" },
  { pattern: /\bhealth\s*(dashboard|home|page)?\b/i, path: "/health", label: "Health Dashboard" },
  { pattern: /\b(tech|technology)\s*(dashboard|home|page)?\b/i, path: "/technology", label: "Technology Dashboard" },
  { pattern: /\benergy\s*(dashboard|home|page)?\b/i, path: "/energy", label: "Energy Dashboard" },
  { pattern: /\btransportation\s*(dashboard|home|page)?\b/i, path: "/transportation", label: "Transportation Dashboard" },
];

// Compare intent: "compare X and Y"
const COMPARE_PATTERN = /\bcompare\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+)/i;

function matchIntent(input: string): IntentResult | null {
  const lower = input.toLowerCase().trim();

  // FAQ matching
  for (const [key, answer] of Object.entries(FAQ)) {
    if (lower.includes(key)) return { answer };
  }

  // Navigation intent (requires action words or question starters)
  const hasNavIntent = /\b(show|go to|open|take me|navigate|where is|find)\b/i.test(lower);
  if (hasNavIntent) {
    for (const { pattern, path, label } of NAV_PATTERNS) {
      if (pattern.test(lower)) {
        return {
          answer: `Opening ${label}.`,
          action: { type: "navigate", path },
        };
      }
    }
  }

  // Compare intent. We deliberately do NOT attach a `search` action here:
  // the previous behavior auto-navigated to /politics/people regardless
  // of subject, so "compare Apple and Boeing" landed on the
  // Congresspeople list with zero results. Compare flows are sector-
  // specific (Finance vs. Health vs. Tech all have their own compare
  // page), so we tell the user where to go and let them pick.
  const compareMatch = lower.match(COMPARE_PATTERN);
  if (compareMatch) {
    const a = compareMatch[1].trim();
    const b = compareMatch[2].trim();
    return {
      answer:
        `To compare ${a} and ${b}, open the dashboard for whichever sector ` +
        `they're in (Finance, Health, Technology, Energy, etc.) and use the ` +
        `Compare button on the sector page. Each sector has its own compare ` +
        `surface so the metrics line up.`,
    };
  }

  return null;
}


// ── Message types ──

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: ChatAction | null;
  loading?: boolean;
}

const SUGGESTED_QUESTIONS = [
  "Who trades the most stock?",
  "Show me Pelosi's profile",
  "How much does Boeing spend on lobbying?",
  "What data sources do you use?",
  "Show me the influence network",
  "How does claim verification work?",
];

// ── Chat bubble event bus (so GlobalSearch can open it) ──

const chatEvents = new EventTarget();
export function openChatAgent() {
  chatEvents.dispatchEvent(new Event("open"));
}

// ── Component ──

export default function ChatAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState(10);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const draggedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Cleanup all pending timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  // Listen for external open events
  useEffect(() => {
    const handler = () => setOpen(true);
    chatEvents.addEventListener("open", handler);
    return () => chatEvents.removeEventListener("open", handler);
  }, []);

  // Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      timersRef.current.push(t);
      // Fetch remaining questions; gate on `open` so closing the chat
      // before the request resolves doesn't setState late.
      let cancelled = false;
      getRemainingQuestions()
        .then((data) => {
          if (cancelled) return;
          setRemaining(data.remaining);
          setLimit(data.limit);
        })
        .catch((err) => { console.warn('[ChatAgent] fetch failed:', err); });
      return () => { cancelled = true; };
    }
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((msg: Omit<Message, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const handleAction = useCallback((action: ChatAction) => {
    if (action.type === "navigate" && action.path) {
      // External destinations (research/verify subdomains) need a real
      // top-level navigation — react-router-dom's navigate() treats them
      // as relative paths and breaks the URL.
      if (/^https?:\/\//i.test(action.path)) {
        window.open(action.path, "_blank", "noopener,noreferrer");
      } else {
        navigate(action.path);
      }
      setOpen(false);
    } else if (action.type === "search" && action.query) {
      // PeoplePage reads `?q=` and filters its list, so this route is
      // honest for politician searches. Compare-of-companies intents
      // no longer emit a `search` action (see matchIntent's compare
      // branch) so this no longer mis-routes "compare Apple and Boeing"
      // here.
      navigate(`/politics/people?q=${encodeURIComponent(action.query)}`);
      setOpen(false);
    }
  }, [navigate]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    const question = text.trim();
    setInput("");
    setSending(true);

    // Add user message
    addMessage({ role: "user", text: question });

    // Tier 1: Client-side intent matching
    const intent = matchIntent(question);
    if (intent) {
      addMessage({
        role: "assistant",
        text: intent.answer || "Here you go.",
        action: intent.action,
      });
      if (intent.action) {
        const t = setTimeout(() => handleAction(intent.action!), 800);
        timersRef.current.push(t);
      }
      setSending(false);
      return;
    }

    // Tier 2+3: Backend (cache + Haiku)
    const loadingId = addMessage({ role: "assistant", text: "", loading: true });

    try {
      const response = await askQuestion(question, {
        page: location.pathname,
      });

      updateMessage(loadingId, {
        text: response.answer,
        action: response.action,
        loading: false,
      });

      if (!response.cached && remaining !== null) {
        setRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      }

      if (response.action) {
        const t = setTimeout(() => handleAction(response.action!), 1200);
        timersRef.current.push(t);
      }
    } catch (err: unknown) {
      updateMessage(loadingId, {
        text: err instanceof Error ? err.message : "Sorry, I couldn't process that question. Please try again.",
        loading: false,
      });
    } finally {
      setSending(false);
    }
  }, [sending, addMessage, updateMessage, handleAction, location.pathname, remaining]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Floating chat bubble */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            drag
            dragMomentum={false}
            dragElastic={0.1}
            whileDrag={{ scale: 1.1, cursor: "grabbing" }}
            onDragStart={() => { draggedRef.current = true; }}
            onDragEnd={() => { const t = setTimeout(() => { draggedRef.current = false; }, 100); timersRef.current.push(t); }}
            onClick={() => {
              if (!draggedRef.current) {
                setOpen(true);
              }
            }}
            className="fixed bottom-6 right-6 z-[9998] flex items-center justify-center w-14 h-14 rounded-full
                       bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30
                       transition-colors cursor-grab active:cursor-grabbing"
            aria-label="Open chat assistant"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              <path d="M8 12h.01" />
              <path d="M12 12h.01" />
              <path d="M16 12h.01" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 z-[9999] w-[400px] h-[520px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)]
                       flex flex-col bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-sm font-semibold text-white">Ask about the data</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/10 text-[10px] font-mono text-white/30 ml-1">
                  {navigator.platform?.includes("Mac") ? "\u2318K" : "Ctrl+K"}
                </kbd>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                aria-label="Close chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-white/40 text-center mt-4">
                    Ask me anything about lobbying, trades, contracts, or political data.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10
                                   text-xs text-white/60 hover:text-white hover:bg-white/[0.1]
                                   transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-zinc-800 text-white/90 rounded-bl-md"
                    }`}
                  >
                    {msg.loading ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        {msg.action && msg.action.type === "navigate" && msg.action.path && (
                          <button
                            onClick={() => handleAction(msg.action!)}
                            className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14" />
                              <path d="m12 5 7 7-7 7" />
                            </svg>
                            Go to page
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-white/10 px-3 py-3 bg-zinc-900/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question..."
                  disabled={sending}
                  className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white
                             placeholder:text-white/30 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
                             disabled:opacity-50 transition-all"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || sending}
                  className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-white/20
                             text-white transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                  aria-label="Send message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 7-7 7 7" />
                    <path d="M12 19V5" />
                  </svg>
                </button>
              </div>
              {remaining !== null && (
                <p className="mt-1.5 text-[11px] text-white/25 text-center">
                  {remaining} AI question{remaining !== 1 ? "s" : ""} remaining today
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
