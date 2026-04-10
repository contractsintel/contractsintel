"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import Link from "next/link";

const CHECK_SVG = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
  </svg>
);

const GOALS: Record<string, { icon: string; title: string }> = {
  find: { icon: "\uD83D\uDD0D", title: "Find the right contracts" },
  manage: { icon: "\uD83D\uDCCA", title: "Stay on top of my pipeline" },
  both: { icon: "\uD83D\uDD04", title: "Both" },
};

export default function OnboardingPage() {
  const { organization } = useDashboard();
  const supabase = createClient();

  // Refetch org data on mount to get fresh values after wizard completion
  const [freshOrg, setFreshOrg] = useState(organization);
  useEffect(() => {
    supabase
      .from("organizations")
      .select("*")
      .eq("id", organization.id)
      .single()
      .then(({ data }) => { if (data) setFreshOrg(data); });
  }, [organization.id, supabase]);

  const [goal, setGoal] = useState(freshOrg.onboarding_goal || organization.onboarding_goal || "");

  // Update goal when freshOrg loads with a value
  useEffect(() => {
    if (freshOrg.onboarding_goal && !goal) setGoal(freshOrg.onboarding_goal);
  }, [freshOrg.onboarding_goal, goal]);

  const step1Complete = !!goal;
  const step2Complete = step1Complete && freshOrg.setup_wizard_complete === true;
  const allComplete = step1Complete && step2Complete;
  const progress = allComplete ? 100 : step1Complete ? 33 : 0;

  const selectedGoal = GOALS[goal];

  const selectGoal = async (key: string) => {
    setGoal(key);
    await supabase.from("organizations").update({ onboarding_goal: key }).eq("id", organization.id);
  };

  const resetGoal = async () => {
    setGoal("");
    await supabase.from("organizations").update({ onboarding_goal: null }).eq("id", organization.id);
  };

  const completeOnboarding = async () => {
    await supabase.from("organizations").update({ onboarding_complete: true }).eq("id", organization.id);
    window.location.href = "/dashboard";
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[660px] mx-auto pt-16 pb-24 px-6">

        {/* Title */}
        <div style={{animation: "fadeInUp 0.5s ease both"}}>
          <h1 className="text-[34px] font-bold text-[#0f172a] tracking-[-0.02em] leading-[1.15]"
              style={{fontFamily: "'DM Serif Display', Georgia, serif"}}>
            Prepare for your first contracts
          </h1>
          <p className="text-[16px] text-[#64748b] mt-3 leading-relaxed">
            Get the most out of your trial with a few key set up steps.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mt-8 mb-12" style={{animation: "fadeInUp 0.5s ease 100ms both"}}>
          <div className="flex justify-end mb-2">
            <span className="text-[14px] font-semibold text-[#4f46e5]">{progress}%</span>
          </div>
          <div className="h-[10px] bg-[#eef2ff] rounded-full overflow-hidden">
            <div className="h-full bg-[#4f46e5] rounded-full transition-all duration-1000 ease-out"
                 style={{width: `${progress}%`}} />
          </div>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[18px] top-[40px] bottom-[40px] w-[2px] bg-[#e5e7eb]" />

          {/* ═══════ STEP 1 ═══════ */}
          <div className="relative mb-10" style={{animation: "fadeInUp 0.5s ease 200ms both"}}>
            <div className="flex items-start gap-4">
              <div className={`relative z-10 w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 shadow-sm bg-[#4f46e5] text-white`}>
                {step1Complete ? CHECK_SVG : <span className="text-[15px] font-bold">1</span>}
              </div>
              <div className="flex-1 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[19px] font-bold text-[#0f172a]">What brings you to ContractsIntel?</h2>
                    <p className="text-[14px] text-[#64748b] mt-0.5">Pick your focus and we&apos;ll tailor your setup steps to match.</p>
                  </div>
                  {step1Complete && (
                    <button onClick={resetGoal}
                      className="text-[13px] text-[#4f46e5] hover:text-[#4338ca] font-medium flex items-center gap-1 shrink-0 ml-4">
                      ✏️ Edit
                    </button>
                  )}
                </div>

                {/* Option cards */}
                {!step1Complete && (
                  <div className="mt-5 space-y-3">
                    {[
                      { key: "find", icon: "\uD83D\uDD0D", bg: "bg-[#eef2ff]", title: "Find the right contracts", desc: "Discover funding aligned to your certifications & NAICS codes, with new matches every day." },
                      { key: "manage", icon: "\uD83D\uDCCA", bg: "bg-[#f0fdf4]", title: "Stay on top of my pipeline", desc: "Track my pipeline, manage deadlines, and handle post-award reporting in one place." },
                      { key: "both", icon: "\uD83D\uDD04", bg: "bg-[#fef3c7]", title: "Both", desc: "Simplify my entire contracting lifecycle, from finding opportunities through contract delivery." },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => selectGoal(opt.key)}
                        className="w-full flex items-center gap-4 p-5 border-2 border-[#e5e7eb] rounded-2xl
                                   text-left transition-all duration-200
                                   hover:border-[#4f46e5] hover:shadow-lg hover:shadow-indigo-100/60 hover:-translate-y-[1px]
                                   active:translate-y-0 active:shadow-md">
                        <div className={`w-12 h-12 rounded-xl ${opt.bg} flex items-center justify-center text-[22px] shrink-0`}>
                          {opt.icon}
                        </div>
                        <div>
                          <div className="text-[15px] font-bold text-[#0f172a]">{opt.title}</div>
                          <div className="text-[13px] text-[#64748b] mt-0.5 leading-relaxed">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected confirmation */}
                {step1Complete && selectedGoal && (
                  <div className="mt-4 flex items-center gap-3 p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
                    <span className="text-[16px]">{selectedGoal.icon}</span>
                    <span className="text-[14px] font-medium text-[#0f172a] flex-1">{selectedGoal.title}</span>
                    <svg className="w-5 h-5 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════ STEP 2 ═══════ */}
          <div className="relative mb-10" style={{animation: "fadeInUp 0.5s ease 350ms both"}}>
            <div className="flex items-start gap-4">
              <div className={`relative z-10 w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                step2Complete ? "bg-[#4f46e5] text-white" : step1Complete ? "bg-[#4f46e5] text-white" : "bg-[#e5e7eb] text-[#94a3b8]"
              }`}>
                {step2Complete ? CHECK_SVG : <span className="text-[15px] font-bold">2</span>}
              </div>
              <div className="flex-1 pt-1">
                <h2 className={`text-[19px] font-bold ${step1Complete ? "text-[#0f172a]" : "text-[#94a3b8]"}`}>
                  Create first project
                </h2>
                <p className="text-[14px] text-[#64748b] mt-0.5">Share more about your organization and what you&apos;re looking for.</p>

                {/* Action card */}
                {step1Complete && !step2Complete && (
                  <Link href="/dashboard/onboarding/setup"
                    className="mt-5 flex items-center justify-between p-5 border-2 border-[#e5e7eb] rounded-2xl
                               hover:border-[#4f46e5] hover:shadow-lg hover:shadow-indigo-100/60 hover:-translate-y-[1px]
                               transition-all duration-200 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[#eef2ff] flex items-center justify-center group-hover:bg-[#e0e7ff] transition-colors">
                        <svg className="w-6 h-6 text-[#4f46e5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                        </svg>
                      </div>
                      <div>
                        <div className="text-[15px] font-bold text-[#0f172a]">New project</div>
                        <div className="text-[13px] text-[#64748b]">A project is a place to search, track, and manage contracts.</div>
                      </div>
                    </div>
                    <span className="px-5 py-2.5 bg-[#4f46e5] text-white text-[13px] font-semibold rounded-lg
                                    group-hover:bg-[#4338ca] transition-colors flex items-center gap-1.5 shrink-0">
                      Get started
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" d="M9 5l7 7-7 7"/>
                      </svg>
                    </span>
                  </Link>
                )}

                {/* Completed */}
                {step2Complete && (
                  <div className="mt-4 flex items-center gap-3 p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
                    <div className="w-3 h-3 rounded-full bg-[#4f46e5]" />
                    <span className="text-[14px] font-medium text-[#0f172a] flex-1">Profile is ready</span>
                    <svg className="w-5 h-5 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════ STEP 3 — CELEBRATION ═══════ */}
          <div className="relative" style={{animation: "fadeInUp 0.5s ease 500ms both"}}>
            <div className="flex items-start gap-4">
              <div className={`relative z-10 w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                allComplete ? "bg-[#4f46e5] text-white" : "bg-[#e5e7eb] text-[#94a3b8]"
              }`}>
                {allComplete ? CHECK_SVG : <span className="text-[15px] font-bold">3</span>}
              </div>
              <div className="flex-1 pt-1">
                <h2 className={`text-[19px] font-bold ${allComplete ? "text-[#0f172a]" : "text-[#94a3b8]"}`}>
                  You&apos;re ready to find contracts
                </h2>

                {allComplete && (
                  <div className="mt-5 bg-gradient-to-br from-[#4f46e5] via-[#5b52f0] to-[#7c3aed] rounded-3xl p-8 text-white shadow-xl shadow-indigo-200/50">
                    <div className="flex items-center gap-3">
                      <span className="text-[36px]">&#127881;</span>
                      <div>
                        <h3 className="text-[20px] font-bold">You&apos;re ready for your first matches!</h3>
                        <p className="text-[15px] text-white/75 mt-1">Your free trial will be unlocked when your matches are generated.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-6">
                      <span className="flex items-center gap-2 px-4 py-2 bg-white/15 backdrop-blur-sm rounded-full text-[13px] font-medium">
                        <svg className="w-4 h-4 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        Goal selected
                      </span>
                      <span className="flex items-center gap-2 px-4 py-2 bg-white/15 backdrop-blur-sm rounded-full text-[13px] font-medium">
                        <svg className="w-4 h-4 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        Project created
                      </span>
                    </div>
                    <button onClick={completeOnboarding}
                      className="mt-8 bg-white text-[#4f46e5] px-8 py-3.5 rounded-xl text-[16px] font-bold
                                 hover:shadow-xl hover:-translate-y-[1px] transition-all duration-200">
                      Go to Dashboard →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Optional documents */}
        {allComplete && (
          <div className="mt-12 ml-[54px]" style={{animation: "fadeInUp 0.5s ease 700ms both"}}>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#94a3b8] mb-4">Optional next step</p>
            <h3 className="text-[16px] font-bold text-[#0f172a] mb-1">Add your documents (Optional)</h3>
            <p className="text-[14px] text-[#64748b] mb-5">ContractsIntel will use these to extract your deadlines and requirements.</p>
            <div className="space-y-3">
              <Link href="/dashboard/settings"
                className="flex items-center justify-between p-4 border border-[#e5e7eb] rounded-xl hover:border-[#c7d2fe] hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#f1f5f9] flex items-center justify-center text-[18px]">&#128196;</div>
                  <div>
                    <div className="text-[14px] font-semibold text-[#0f172a]">Add your first award</div>
                    <div className="text-[12px] text-[#64748b]">Upload your award document</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </Link>
              <Link href="/dashboard/settings"
                className="flex items-center justify-between p-4 border border-[#e5e7eb] rounded-xl hover:border-[#c7d2fe] hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#f1f5f9] flex items-center justify-center text-[18px]">&#128202;</div>
                  <div>
                    <div className="text-[14px] font-semibold text-[#0f172a]">Do you have a tracking spreadsheet?</div>
                    <div className="text-[12px] text-[#64748b]">Upload your contract data using our template</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
