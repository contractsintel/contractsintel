"use client";

import { useState } from "react";
import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { cleanupDemoData } from "@/lib/demo-cleanup";

export function DemoBanner() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [visible, setVisible] = useState(true);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    await cleanupDemoData(supabase, organization.id);
    setVisible(false);
    window.location.reload();
  };

  if (!visible) return null;

  return (
    <div className="border border-[#e5e7eb] bg-[#eff4ff] px-5 py-3 mb-6 flex items-center justify-between">
      <p className="text-sm text-[#4b5563]">
        <span className="mr-2">&#128203;</span>
        Sample data — your real opportunities will appear after your first daily
        digest at 7am tomorrow
      </p>
      <button
        onClick={handleClear}
        disabled={clearing}
        className="text-xs text-[#3b82f6] hover:text-[#111827] transition-colors shrink-0 ml-4"
      >
        {clearing ? "Clearing..." : "Clear sample data"}
      </button>
    </div>
  );
}
