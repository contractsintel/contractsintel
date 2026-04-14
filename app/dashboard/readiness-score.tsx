"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ScoreFactor {
  label: string;
  score: number;
  max: number;
  status: "complete" | "partial" | "missing";
  action: string;
  link: string;
}

interface ReadinessData {
  score: number;
  maxScore: number;
  percentage: number;
  level: string;
  levelDetail: string;
  factors: ScoreFactor[];
}

function statusColor(s: string) {
  if (s === "complete") return "bg-[#059669]";
  if (s === "partial") return "bg-[#d97706]";
  return "bg-[#dc2626]";
}

function statusIcon(s: string) {
  if (s === "complete") return "\u2713";
  if (s === "partial") return "\u25CB";
  return "\u2717";
}

function levelColor(pct: number) {
  if (pct >= 90) return "text-[#059669]";
  if (pct >= 70) return "text-[#2563eb]";
  if (pct >= 50) return "text-[#d97706]";
  return "text-[#dc2626]";
}

function barColor(pct: number) {
  if (pct >= 90) return "bg-[#059669]";
  if (pct >= 70) return "bg-[#2563eb]";
  if (pct >= 50) return "bg-[#d97706]";
  return "bg-[#dc2626]";
}

export function ReadinessScore({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/readiness-score");
        if (r.ok) setData(await r.json());
      } catch { /* swallow */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="ci-card p-5 animate-pulse"><div className="h-4 bg-[#f1f5f9] rounded w-32" /></div>;
  if (!data) return null;

  const incomplete = data.factors.filter(f => f.status !== "complete");
  const complete = data.factors.filter(f => f.status === "complete");

  if (compact) {
    return (
      <div className="ci-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="ci-section-label">GovCon Readiness</h2>
          <span className={`text-lg font-bold font-mono ${levelColor(data.percentage)}`}>{data.percentage}%</span>
        </div>
        <div className="w-full bg-[#f1f5f9] rounded-full h-2 mb-2">
          <div className={`${barColor(data.percentage)} h-2 rounded-full transition-all duration-700`} style={{ width: `${data.percentage}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${levelColor(data.percentage)}`}>{data.level}</span>
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-[#2563eb] hover:text-[#1d4ed8]">
            {expanded ? "Hide details" : `${incomplete.length} items to improve`}
          </button>
        </div>
        {expanded && incomplete.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#f1f5f9] space-y-2">
            {incomplete.slice(0, 3).map((f, i) => (
              <Link key={i} href={f.link} className="flex items-center gap-2 text-[12px] text-[#475569] hover:text-[#2563eb] group">
                <span className={`w-1.5 h-1.5 rounded-full ${statusColor(f.status)}`} />
                <span className="flex-1">{f.action}</span>
                <span className="text-[#94a3b8] group-hover:text-[#2563eb]">&rarr;</span>
              </Link>
            ))}
            {incomplete.length > 3 && (
              <Link href="/dashboard/get-started" className="text-[11px] text-[#2563eb]">+{incomplete.length - 3} more items</Link>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="ci-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="ci-section-label">GovCon Readiness Score</h2>
        <div className="text-right">
          <div className={`text-3xl font-bold font-mono ${levelColor(data.percentage)}`}>{data.percentage}%</div>
          <div className={`text-xs font-medium ${levelColor(data.percentage)}`}>{data.level}</div>
        </div>
      </div>

      <div className="w-full bg-[#f1f5f9] rounded-full h-3 mb-3">
        <div className={`${barColor(data.percentage)} h-3 rounded-full transition-all duration-700`} style={{ width: `${data.percentage}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-[#94a3b8] mb-4">
        <span>Getting Started</span><span>Foundation</span><span>Developing</span><span>Competitive</span><span>Contract Ready</span>
      </div>

      <p className="text-[13px] text-[#475569] mb-6">{data.levelDetail}</p>

      {incomplete.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] uppercase tracking-wide text-[#dc2626] font-medium mb-3">Action Items ({incomplete.length})</h3>
          <div className="space-y-2">
            {incomplete.map((f, i) => (
              <Link key={i} href={f.link} className="flex items-center gap-3 p-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] hover:bg-[#fee2e2] transition-colors group">
                <span className={`w-5 h-5 rounded-full ${statusColor(f.status)} text-white text-[10px] flex items-center justify-center font-bold`}>
                  {statusIcon(f.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[#0f172a] font-medium">{f.label}</div>
                  <div className="text-[11px] text-[#64748b]">{f.action}</div>
                </div>
                <div className="text-[11px] font-mono text-[#dc2626]">{f.score}/{f.max}</div>
                <span className="text-[#94a3b8] group-hover:text-[#dc2626]">&rarr;</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {complete.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-[#059669] font-medium mb-3">Completed ({complete.length})</h3>
          <div className="space-y-1.5">
            {complete.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#f8f9fb]">
                <span className="w-5 h-5 rounded-full bg-[#059669] text-white text-[10px] flex items-center justify-center font-bold">{statusIcon(f.status)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-[#64748b]">{f.label}</div>
                  <div className="text-[11px] text-[#94a3b8]">{f.action}</div>
                </div>
                <div className="text-[11px] font-mono text-[#059669]">{f.score}/{f.max}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
