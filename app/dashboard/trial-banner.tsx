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
      className={`flex items-center justify-between px-4 py-2 mb-4 text-xs border-b ${
        isBdPro
          ? "bg-[#0c1a3d] border-[#1e3a6e] text-[#93b4e8]"
          : "bg-[#1a0c3d] border-[#3a1e6e] text-[#b493e8]"
      }`}
    >
      <span>
        {isBdPro ? (
          <>
            <strong className="text-[#3b82f6]">BD Pro</strong> feature — free during your trial. Included in BD Pro ($999/mo) and Team ($2,499/mo).
          </>
        ) : (
          <>
            <strong className="text-[#a78bfa]">Team</strong> feature — free during your trial. Included in Team ($2,499/mo).
          </>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 text-[#4a5a75] hover:text-[#e8edf8] text-base leading-none"
      >
        &times;
      </button>
    </div>
  );
}
