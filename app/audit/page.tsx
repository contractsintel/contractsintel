"use client";

import { useState } from "react";
import Link from "next/link";

interface AuditResult {
  score: number;
  entity: {
    legalBusinessName: string;
    uei: string;
    cageCode: string | null;
    registrationStatus: string;
    expirationDate: string | null;
  };
  categories: {
    name: string;
    score: number;
    details: string;
  }[];
  recommendations: string[];
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-[#22c55e]";
  if (score >= 60) return "text-[#f59e0b]";
  return "text-[#ef4444]";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-[#22c55e]";
  if (score >= 60) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

export default function AuditPage() {
  const [uei, setUei] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [revealFull, setRevealFull] = useState(false);

  const runAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uei.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/audit?uei=${encodeURIComponent(uei.trim())}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to run audit. Please try again.");
    }
    setLoading(false);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !result) return;
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          uei,
          company_name: result.entity.legalBusinessName,
          audit_score: result.score,
        }),
      });
      setEmailSubmitted(true);
      setRevealFull(true);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="min-h-screen bg-[#080a0f]">
      {/* Nav */}
      <nav className="border-b border-[#1e2535] bg-[#080a0f]/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
            CI
          </div>
          <span className="font-semibold text-[15px] text-[#e8edf8]">
            Contracts<span className="text-[#3b82f6]">Intel</span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-[#8b9ab5] hover:text-[#e8edf8]">Sign In</Link>
          <Link href="/signup" className="text-sm bg-[#2563eb] text-white px-4 py-1.5 hover:bg-[#3b82f6] transition-colors">
            Start Free Trial
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif text-[#e8edf8] mb-3">Free SAM.gov Registration Audit</h1>
          <p className="text-[#8b9ab5]">
            Enter your UEI to get an instant compliance score and actionable recommendations.
          </p>
        </div>

        {/* UEI Input */}
        <form onSubmit={runAudit} className="flex gap-3 mb-10">
          <input
            type="text"
            value={uei}
            onChange={(e) => setUei(e.target.value)}
            placeholder="Enter your UEI (e.g. J7M9HPTGJ1S8)"
            className="flex-1 bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
          />
          <button
            type="submit"
            disabled={loading || !uei.trim()}
            className="bg-[#2563eb] text-white px-6 py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
          >
            {loading ? "Auditing..." : "Run Audit"}
          </button>
        </form>

        {error && (
          <div className="border border-[#ef4444]/30 bg-[#ef4444]/5 p-4 mb-6 text-sm text-[#ef4444]">
            {error}
          </div>
        )}

        {result && (
          <div>
            {/* Score */}
            <div className="border border-[#1e2535] bg-[#0d1018] p-8 mb-6 text-center">
              <div className="text-sm text-[#4a5a75] font-mono uppercase tracking-wider mb-2">
                SAM Registration Score
              </div>
              <div className={`text-6xl font-bold font-mono ${scoreColor(result.score)}`}>
                {result.score}
              </div>
              <div className="w-full max-w-xs mx-auto h-3 bg-[#111520] mt-4">
                <div className={`h-full ${scoreBg(result.score)} transition-all`} style={{ width: `${result.score}%` }} />
              </div>
              <div className="mt-4">
                <p className="text-sm text-[#e8edf8]">{result.entity.legalBusinessName}</p>
                <p className="text-xs text-[#4a5a75] font-mono mt-1">
                  UEI: {result.entity.uei}
                  {result.entity.cageCode && ` | CAGE: ${result.entity.cageCode}`}
                </p>
              </div>
            </div>

            {/* Categories */}
            <div className="grid grid-cols-2 gap-px bg-[#1e2535] border border-[#1e2535] mb-6">
              {result.categories.map((cat) => (
                <div key={cat.name} className="bg-[#0d1018] p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#8b9ab5]">{cat.name}</span>
                    <span className={`text-lg font-bold font-mono ${scoreColor(cat.score)}`}>
                      {cat.score}
                    </span>
                  </div>
                  <p className="text-xs text-[#4a5a75]">{cat.details}</p>
                </div>
              ))}
            </div>

            {/* Recommendations (blurred) */}
            <div className="relative">
              <div className={`border border-[#1e2535] bg-[#0d1018] p-6 ${!revealFull ? "filter blur-sm" : ""}`}>
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-4">
                  Recommendations
                </h3>
                <div className="space-y-3">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-[#3b82f6] shrink-0">&#8226;</span>
                      <p className="text-sm text-[#8b9ab5]">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email capture overlay */}
              {!revealFull && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="border border-[#1e2535] bg-[#0d1018] p-6 max-w-sm w-full text-center">
                    <h3 className="text-sm font-medium text-[#e8edf8] mb-2">
                      Get Your Full Report
                    </h3>
                    <p className="text-xs text-[#8b9ab5] mb-4">
                      Enter your email to reveal actionable recommendations.
                    </p>
                    {emailSubmitted ? (
                      <p className="text-sm text-[#22c55e]">Report unlocked!</p>
                    ) : (
                      <form onSubmit={submitEmail} className="flex gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@company.com"
                          required
                          className="flex-1 bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                        />
                        <button
                          type="submit"
                          className="bg-[#2563eb] text-white px-4 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
                        >
                          Reveal
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="mt-8 text-center">
              <p className="text-sm text-[#8b9ab5] mb-3">
                Want continuous monitoring and AI-powered contract matching?
              </p>
              <Link
                href="/signup"
                className="inline-block bg-[#2563eb] text-white px-8 py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
