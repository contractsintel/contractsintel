"use client";

import { useState, useEffect } from "react";

const GUIDES: Record<string, string> = {
  dashboard:
    "Your matched opportunities from 100+ government sources appear here every morning at 7am. Federal, state, military, and SBIR opportunities are all included — look for the colored source badge on each card. Review the scores (higher = better fit), read the AI recommendation, then click Track, Mark as Bidding, or Skip on each one.",
  pipeline:
    "Every opportunity you track appears here organized by stage. Move cards between columns using the dropdown to change status. When you mark something as Won, your delivery dashboard and past performance record are created automatically.",
  proposals:
    "Mark any opportunity as 'Bidding' in your Pipeline, then come here to generate an AI first draft. The AI reads the solicitation and writes your Technical Approach, Past Performance narrative, and Executive Summary. Review, polish, and submit.",
  compliance:
    "Your health score shows your overall compliance status from 0–100. Red items need immediate attention. Check this page weekly to stay ahead of SAM.gov renewals, certification reviews, CMMC deadlines, and FAR regulation changes.",
  "past-performance":
    "Records are created automatically when you win a contract. Log your performance monthly using the prompt — it takes 5 minutes. When you need past performance for a proposal, click Generate PPQ to create ready-to-paste narratives from your logged data.",
  contracts:
    "Your active contracts with all milestones, invoices, and option periods. Check deadlines weekly. If the government is late paying you, click Flag Late Payment to generate a Prompt Payment Act demand letter.",
  cpars:
    "Enter your CPARS ratings as you receive them. If any rating is below Satisfactory, the AI generates a formal response draft for you to review and submit. Track your rating trends over time.",
  network:
    "Browse teaming opportunities from prime contractors looking for subs with your certifications. Click Express Interest to notify the prime. You can also post your own teaming needs if you're the prime.",
  competitors:
    "Competitor profiles are built automatically from your pipeline wins and losses. The more bids you track, the more useful this data becomes. Check competitor profiles before writing proposals to understand who you're up against.",
  analytics:
    "Your win rate by agency, color-coded so you can see where you're strong and where you're wasting BD resources. Loss analysis shows AI insights on every lost bid to help you improve.",
};

export function InlineGuide({ page }: { page: string }) {
  const text = GUIDES[page];
  const dismissKey = `ci_guide_dismissed_${page}`;
  const expandKey = `ci_guide_seen_${page}`;

  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!text) return;
    setMounted(true);
    const wasDismissed = localStorage.getItem(dismissKey) === "1";
    if (wasDismissed) {
      setDismissed(true);
      return;
    }
    setDismissed(false);
    const wasSeen = localStorage.getItem(expandKey) === "1";
    setExpanded(!wasSeen);
  }, [dismissKey, expandKey, text]);

  if (!text || !mounted || dismissed) return null;

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next) {
      localStorage.setItem(expandKey, "1");
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  return (
    <div
      className="mb-5 border border-[#f0f1f3] bg-[#f8f9fb]"
      style={{ borderRadius: "12px", overflow: "hidden" }}
    >
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#f0f1f3] transition-colors"
      >
        <span className="text-sm font-medium text-[#4b5563] flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#3b82f6]"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          How to use this page
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[#9ca3af] transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-6 pb-4">
          <p className="text-sm text-[#4b5563] leading-relaxed">{text}</p>
          <button
            onClick={handleDismiss}
            className="mt-3 text-xs text-[#9ca3af] hover:text-[#4b5563] transition-colors"
          >
            Don&apos;t show this again
          </button>
        </div>
      )}
    </div>
  );
}
