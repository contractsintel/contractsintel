"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Link from "next/link";

const CHECK = (
  <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
  </svg>
);

export default function OnboardingPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [goal, setGoal] = useState(organization.onboarding_goal || "");
  const profileComplete = !!(organization.naics_codes?.length && organization.certifications?.length);

  const step1Done = !!goal;
  const step2Done = profileComplete;
  const allDone = step1Done && step2Done;
  const stepsComplete = (step1Done ? 1 : 0) + (step2Done ? 1 : 0) + (allDone ? 1 : 0);
  const progress = Math.round((stepsComplete / 3) * 100);

  return (
    <div className="max-w-[720px] mx-auto pt-12 pb-16">
      {/* Header */}
      <div style={{animation: "fadeInUp 0.4s ease 0ms both"}}>
        <h1 className="text-[32px] font-semibold text-[#111827] tracking-[-0.02em]"
            style={{fontFamily: "'DM Serif Display', Georgia, serif"}}>
          Set up your contract intelligence
        </h1>
        <p className="text-[16px] text-[#6b7280] mt-2">
          Get the most out of your trial with a few key setup steps.
        </p>

        {/* Progress bar */}
        <div className="mt-8 mb-10">
          <div className="flex items-center justify-end mb-2">
            <span className="text-[14px] font-semibold text-[#6b7280]">{progress}%</span>
          </div>
          <div className="h-[10px] bg-[#e5e7eb] rounded-full overflow-hidden">
            <div className="h-full bg-[#2563eb] rounded-full transition-all duration-700 ease-out"
                 style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Steps container with vertical connecting line */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[15px] top-[32px] bottom-[32px] w-[2px] bg-[#e5e7eb]" />

        {/* ═══ STEP 1: What brings you here? ═══ */}
        <div className="relative mb-8" style={{animation: "fadeInUp 0.4s ease 0ms both"}}>
          <div className="flex items-start gap-4 mb-4">
            {/* Step indicator */}
            <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              step1Done ? "bg-[#2563eb]" : "bg-[#2563eb]"
            }`}>
              {step1Done ? CHECK : <span className="text-[14px] font-bold text-white">1</span>}
            </div>
            {/* Title + Edit */}
            <div className="flex-1 flex items-start justify-between pt-0.5">
              <div>
                <h2 className="text-[18px] font-semibold text-[#111827]">What brings you to ContractsIntel?</h2>
                <p className="text-[14px] text-[#6b7280] mt-1">Pick your focus and we&apos;ll tailor your setup steps to match.</p>
              </div>
              {goal && (
                <button onClick={() => setGoal("")}
                  className="text-[13px] text-[#2563eb] hover:text-[#1d4ed8] flex items-center gap-1.5 shrink-0 ml-4">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Option cards or selected state */}
          {!goal ? (
            <div className="ml-12 space-y-3 mt-4">
              {[
                { key: "find_contracts", emoji: "\uD83D\uDD0D", title: "Find the right contracts", desc: "Discover contracts matched to my certifications & NAICS codes, with new matches daily." },
                { key: "manage_pipeline", emoji: "\uD83D\uDCCA", title: "Stay on top of my pipeline", desc: "Track my bids, manage deadlines, and handle post-award delivery in one place." },
                { key: "both", emoji: "\uD83D\uDD04", title: "Both", desc: "Manage my entire contracting lifecycle, from finding opportunities through contract delivery." },
              ].map(option => (
                <button key={option.key}
                  onClick={async () => {
                    setGoal(option.key);
                    await supabase.from("organizations")
                      .update({ onboarding_goal: option.key })
                      .eq("id", organization.id);
                  }}
                  className="w-full flex items-center gap-4 p-5 border border-[#e5e7eb] rounded-xl
                             hover:border-[#2563eb] hover:bg-[#fafbff] hover:shadow-sm hover:scale-[1.01]
                             transition-all duration-200 text-left group">
                  <div className="w-12 h-12 rounded-xl bg-[#f3f4f6] flex items-center justify-center text-[22px]
                                 group-hover:bg-[#eff6ff] transition-colors shrink-0">
                    {option.emoji}
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-[#111827]">{option.title}</div>
                    <div className="text-[14px] text-[#6b7280] mt-1">{option.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="ml-12 mt-4">
              <div className="flex items-center gap-4 p-4 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[18px] shrink-0">
                  {goal === "find_contracts" ? "\uD83D\uDD0D" : goal === "manage_pipeline" ? "\uD83D\uDCCA" : "\uD83D\uDD04"}
                </div>
                <span className="text-[15px] font-medium text-[#111827] flex-1">
                  {goal === "find_contracts" ? "Find the right contracts" :
                   goal === "manage_pipeline" ? "Stay on top of my pipeline" :
                   "Both — full lifecycle"}
                </span>
                <svg className="w-5 h-5 text-[#059669] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* ═══ STEP 2: Set up business profile ═══ */}
        <div className="relative mb-8" style={{animation: "fadeInUp 0.4s ease 150ms both"}}>
          <div className="flex items-start gap-4 mb-4">
            <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              step2Done ? "bg-[#2563eb]" : goal ? "bg-[#2563eb]" : "bg-[#e5e7eb]"
            }`}>
              {step2Done ? CHECK : <span className={`text-[14px] font-bold ${goal ? "text-white" : "text-[#9ca3af]"}`}>2</span>}
            </div>
            <div className="pt-0.5">
              <h2 className={`text-[18px] font-semibold ${goal ? "text-[#111827]" : "text-[#9ca3af]"}`}>
                Set up your business profile
              </h2>
              <p className="text-[14px] text-[#6b7280] mt-1">Share your certifications, NAICS codes, and what you&apos;re looking for.</p>
            </div>
          </div>

          {goal && !step2Done && (
            <div className="ml-12 mt-4">
              <Link href="/dashboard/onboarding/setup"
                className="flex items-center justify-between p-5 border border-[#e5e7eb] rounded-xl
                           hover:border-[#2563eb] hover:shadow-md transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#f3f4f6] flex items-center justify-center
                                 group-hover:bg-[#eff6ff] transition-colors shrink-0">
                    <svg className="w-6 h-6 text-[#6b7280] group-hover:text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-[#111827]">New profile setup</div>
                    <div className="text-[14px] text-[#6b7280] mt-0.5">Enter your certifications, NAICS codes, and contract preferences.</div>
                  </div>
                </div>
                <span className="px-5 py-2.5 bg-[#2563eb] text-white text-[13px] font-semibold rounded-lg
                                group-hover:bg-[#1d4ed8] transition-colors flex items-center gap-1.5 shrink-0">
                  Get started
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </span>
              </Link>
            </div>
          )}

          {step2Done && (
            <div className="ml-12 mt-4">
              <div className="flex items-center gap-4 p-4 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl">
                <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
                <span className="text-[15px] font-medium text-[#111827] flex-1">Profile configured — matches are being generated</span>
                <svg className="w-5 h-5 text-[#059669] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* ═══ STEP 3: You're ready ═══ */}
        <div className="relative mb-8" style={{animation: "fadeInUp 0.4s ease 300ms both"}}>
          <div className="flex items-start gap-4 mb-4">
            <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              allDone ? "bg-[#2563eb]" : "bg-[#e5e7eb]"
            }`}>
              {allDone ? CHECK : <span className="text-[14px] font-bold text-[#9ca3af]">3</span>}
            </div>
            <h2 className={`text-[18px] font-semibold pt-0.5 ${allDone ? "text-[#111827]" : "text-[#9ca3af]"}`}>
              You&apos;re ready to find contracts
            </h2>
          </div>

          {allDone && (
            <div className="ml-12 mt-4">
              <div className="bg-[#2563eb] rounded-2xl p-8 text-white">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[28px]">&#127881;</span>
                  <h3 className="text-[20px] font-semibold">Your contract intelligence is ready!</h3>
                </div>
                <p className="text-[15px] text-blue-100 mb-5">
                  Your matched contracts are being generated now. Your first daily digest arrives tomorrow at 7am.
                </p>
                <div className="flex items-center gap-3 mb-6">
                  <span className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full text-[13px] font-medium">
                    <svg className="w-4 h-4 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    Goal selected
                  </span>
                  <span className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full text-[13px] font-medium">
                    <svg className="w-4 h-4 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-[#2563eb] rounded-xl
                             text-[16px] font-semibold hover:bg-blue-50 transition-colors mt-1">
                  Go to Dashboard
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional documents section — only after all steps done */}
      {allDone && (
        <div className="ml-12 mt-4" style={{animation: "fadeInUp 0.4s ease 450ms both"}}>
          <div className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">
            Optional Next Step
          </div>
          <h3 className="text-[16px] font-semibold text-[#111827] mb-1">Add your documents (Optional)</h3>
          <p className="text-[14px] text-[#6b7280] mb-4">
            ContractsIntel will use these to generate better proposals and track compliance.
          </p>
          <div className="space-y-3">
            <Link href="/dashboard/settings"
              className="flex items-center justify-between p-4 border border-[#e5e7eb] rounded-xl hover:border-[#d1d5db] transition-all">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                </svg>
                <div>
                  <div className="text-[14px] font-medium text-[#111827]">Upload your capability statement</div>
                  <div className="text-[12px] text-[#6b7280]">Used by AI to generate tailored proposals</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7"/>
              </svg>
            </Link>
            <Link href="/dashboard/settings"
              className="flex items-center justify-between p-4 border border-[#e5e7eb] rounded-xl hover:border-[#d1d5db] transition-all">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                <div>
                  <div className="text-[14px] font-medium text-[#111827]">Import existing contract data</div>
                  <div className="text-[12px] text-[#6b7280]">Upload a spreadsheet of your current contracts</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
