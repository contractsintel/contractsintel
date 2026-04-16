"use client";

import { useState } from "react";
import { useDashboard } from "./context";
import { isTrialActive, getPageTier } from "@/lib/feature-gate";

export function TrialTierBanner({ page }: { page: string }) {
  const { organization } = useDashboard();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!isTrialActive(organization)) return null;

  const pageTier = getPageTier(page);
  if (pageTier === "discovery") return null;

  const isBdPro = pageTier === "bd_pro";

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 mb-4 text-xs rounded-lg border ${
        isBdPro
          ? "bg-[#eff4ff] border-[#bfdbfe] text-[#1e40af]"
          : "bg-[#f5f3ff] border-[#ddd6fe] text-[#5b21b6]"
      }`}
    >
      <span>
        {isBdPro ? (
          <>
            <strong className="text-[#3b82f6]">BD Pro</strong> feature — free during your trial. Included in BD Pro ($299/mo) and Team ($899/mo).
          </>
        ) : (
          <>
            <strong className="text-[#a78bfa]">Team</strong> feature — free during your trial. Included in Team ($899/mo).
          </>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 text-[#94a3b8] hover:text-[#0f172a] text-base leading-none"
      >
        &times;
      </button>
    </div>
  );
}
