"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Link from "next/link";

export default function OnboardingPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [goal, setGoal] = useState(organization.onboarding_goal || "");
  const [projectCreated, setProjectCreated] = useState(
    !!(organization.naics_codes?.length && organization.certifications?.length)
  );

  const steps = [
    { complete: !!goal },
    { complete: projectCreated },
    { complete: !!goal && projectCreated },
  ];
  const progress = Math.round((steps.filter(s => s.complete).length / steps.length) * 100);

  return (
    <div className="max-w-[800px] mx-auto">
      {/* Page header */}
      <h1 className="text-[28px] font-medium text-[#111827] tracking-[-0.01em]"
          style={{fontFamily: "'DM Serif Display', Georgia, serif"}}>
        Set up your contract intelligence
      </h1>
      <p className="text-[15px] text-[#6b7280] mt-1">
        Get the most out of your trial with a few key setup steps.
      </p>

      {/* Progress bar */}
      <div className="mt-6 mb-8">
        <div className="flex items-center justify-between mb-2">
          <div />
          <span className="text-[13px] font-medium text-[#6b7280]">{progress}%</span>
        </div>
        <div className="h-[10px] bg-[#e5e7eb] rounded-full overflow-hidden">
          <div className="h-full bg-[#2563eb] rounded-full transition-all duration-700 ease-out"
               style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Step 1: What brings you here? */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {goal ? (
            <div className="w-7 h-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0">
              <span className="text-[13px] font-bold text-white">1</span>
            </div>
          )}
          <div>
            <h2 className="text-[16px] font-semibold text-[#111827]">What brings you to ContractsIntel?</h2>
            <p className="text-[13px] text-[#6b7280]">Pick your focus and we&apos;ll tailor your setup steps to match.</p>
          </div>
          {goal && (
            <button onClick={() => setGoal("")}
              className="ml-auto text-[13px] text-[#2563eb] hover:text-[#1d4ed8] flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              Edit
            </button>
          )}
        </div>

        {!goal ? (
          <div className="ml-10 space-y-3 mt-3">
            {[
              { key: "find_contracts", icon: "\uD83D\uDD0D", title: "Find the right contracts", desc: "Discover contracts matched to my certifications & NAICS codes, with new matches daily." },
              { key: "manage_pipeline", icon: "\uD83D\uDCCA", title: "Stay on top of my pipeline", desc: "Track my bids, manage deadlines, and handle post-award delivery in one place." },
              { key: "both", icon: "\uD83D\uDD04", title: "Both", desc: "Manage my entire contracting lifecycle, from finding opportunities through contract delivery." },
            ].map(option => (
              <button key={option.key}
                onClick={async () => {
                  setGoal(option.key);
                  await supabase.from("organizations")
                    .update({ onboarding_goal: option.key })
                    .eq("id", organization.id);
                }}
                className="w-full flex items-center gap-4 p-4 border border-[#e5e7eb] rounded-xl hover:border-[#2563eb] hover:bg-[#fafbff] transition-all text-left group">
                <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[18px] group-hover:bg-[#eff6ff] transition-colors shrink-0">
                  {option.icon}
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[#111827]">{option.title}</div>
                  <div className="text-[13px] text-[#6b7280] mt-0.5">{option.desc}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="ml-10 mt-3">
            <div className="flex items-center gap-3 p-3.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl">
              <span className="text-[14px] text-[#111827]">
                {goal === "find_contracts" ? "\uD83D\uDD0D Find the right contracts" :
                 goal === "manage_pipeline" ? "\uD83D\uDCCA Stay on top of my pipeline" :
                 "\uD83D\uDD04 Both — full lifecycle"}
              </span>
              <svg className="w-4 h-4 text-[#059669] ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Create first project */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {projectCreated ? (
            <div className="w-7 h-7 rounded-full bg-[#2563eb] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          ) : (
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${goal ? "bg-[#059669]" : "bg-[#d1d5db]"}`}>
              <span className="text-[13px] font-bold text-white">2</span>
            </div>
          )}
          <div>
            <h2 className={`text-[16px] font-semibold ${goal ? "text-[#111827]" : "text-[#9ca3af]"}`}>
              Set up your business profile
            </h2>
            <p className="text-[13px] text-[#6b7280]">Share your certifications, NAICS codes, and what you&apos;re looking for.</p>
          </div>
        </div>

        {goal && !projectCreated && (
          <div className="ml-10 mt-3">
            <Link href="/dashboard/onboarding/setup"
              className="flex items-center justify-between p-4 border border-[#e5e7eb] rounded-xl hover:border-[#2563eb] hover:shadow-sm transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center group-hover:bg-[#eff6ff] transition-colors">
                  <svg className="w-5 h-5 text-[#6b7280] group-hover:text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[#111827]">New profile setup</div>
                  <div className="text-[13px] text-[#6b7280]">Enter your certifications, NAICS codes, and contract preferences.</div>
                </div>
              </div>
              <span className="px-4 py-2 bg-[#2563eb] text-white text-[13px] font-semibold rounded-lg group-hover:bg-[#1d4ed8] transition-colors flex items-center gap-1.5 shrink-0">
                Get started
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" d="M9 5l7 7-7 7"/>
                </svg>
              </span>
            </Link>
          </div>
        )}

        {projectCreated && (
          <div className="ml-10 mt-3">
            <div className="flex items-center gap-3 p-3.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl">
              <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
              <span className="text-[14px] text-[#111827]">Profile configured — matches are being generated</span>
              <svg className="w-4 h-4 text-[#059669] ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Ready state */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${goal && projectCreated ? "bg-[#2563eb]" : "bg-[#d1d5db]"}`}>
            {goal && projectCreated ? (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
              </svg>
            ) : (
              <span className="text-[13px] font-bold text-white">3</span>
            )}
          </div>
          <h2 className={`text-[16px] font-semibold ${goal && projectCreated ? "text-[#111827]" : "text-[#9ca3af]"}`}>
            You&apos;re ready to find contracts
          </h2>
        </div>

        {goal && projectCreated && (
          <div className="ml-10 mt-3">
            <div className="bg-[#2563eb] rounded-2xl p-6 text-white">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[24px]">&#127881;</span>
                <h3 className="text-[18px] font-semibold">Your contract intelligence is ready!</h3>
              </div>
              <p className="text-[14px] text-blue-100 mb-4">
                Your matched contracts are being generated now. Your first daily digest arrives tomorrow at 7am.
              </p>
              <div className="flex items-center gap-3 mb-5">
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-full text-[12px] font-medium">
                  <svg className="w-3.5 h-3.5 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  Goal selected
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-full text-[12px] font-medium">
                  <svg className="w-3.5 h-3.5 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  Profile configured
                </span>
              </div>
              <Link href="/dashboard"
                onClick={async (e) => {
                  e.preventDefault();
                  await supabase.from("organizations")
                    .update({ onboarding_complete: true })
                    .eq("id", organization.id);
                  window.location.href = "/dashboard";
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#2563eb] rounded-xl text-[15px] font-semibold hover:bg-blue-50 transition-colors">
                Go to Dashboard
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                </svg>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
