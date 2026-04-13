"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { searchNaics, NAICS_LOOKUP } from "@/lib/naics-codes";

const CERTIFICATIONS = [
  { id: "8(a)", label: "8(a)", desc: "SBA 8(a) Business Development", icon: "A" },
  { id: "SDVOSB", label: "SDVOSB", desc: "Service-Disabled Veteran-Owned", icon: "V" },
  { id: "WOSB", label: "WOSB", desc: "Women-Owned Small Business", icon: "W" },
  { id: "EDWOSB", label: "EDWOSB", desc: "Economically Disadvantaged WOSB", icon: "E" },
  { id: "HUBZone", label: "HUBZone", desc: "Historically Underutilized Business Zone", icon: "H" },
  { id: "Small Business", label: "Small Business", desc: "SBA Small Business", icon: "S" },
];

export function UnlockButton() {
  const { organization } = useDashboard();
  const [open, setOpen] = useState(false);
  const [unlockCount, setUnlockCount] = useState(0);

  const isIncomplete =
    !organization.naics_codes?.length || !organization.certifications?.length;

  // Calculate unlock count estimate
  useEffect(() => {
    if (!isIncomplete) return;
    const supabase = createClient();
    (async () => {
      const { count } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .not("naics_code", "is", null)
        .in("source", ["sam_gov", "usaspending"])
        ;
      setUnlockCount(Math.min(count ?? 0, 9999));
    })();
  }, [isIncomplete]);

  // Check URL param for deep link
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("unlock=true")) {
      setOpen(true);
    }
  }, []);

  if (!isIncomplete) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 text-white text-sm font-bold rounded-full shadow-lg hover:scale-105 transition-transform duration-200"
        style={{
          background: "linear-gradient(135deg, #2563eb, #7c3aed)",
          animation: "unlockPulse 2s ease-in-out infinite",
        }}
      >
        <span>Unlock More Matches</span>
        {unlockCount > 0 && (
          <span className="bg-white/20 backdrop-blur-[2px] px-2 py-0.5 rounded-full text-xs">
            +{unlockCount.toLocaleString()} more
          </span>
        )}
      </button>

      {/* Panel */}
      {open && <UnlockPanel onClose={() => setOpen(false)} unlockCount={unlockCount} />}

      <style jsx global>{`
        @keyframes unlockPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(37, 99, 235, 0.15); }
          50% { box-shadow: 0 4px 30px rgba(37, 99, 235, 0.4); }
        }
        @keyframes confettiBurst {
          0% { transform: scale(0); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes countUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

function UnlockPanel({ onClose, unlockCount }: { onClose: () => void; unlockCount: number }) {
  const { organization, user } = useDashboard();
  const supabase = createClient();

  const [naicsSearch, setNaicsSearch] = useState("");
  const [naicsSuggestions, setNaicsSuggestions] = useState<typeof NAICS_LOOKUP>([]);
  const [selectedNaics, setSelectedNaics] = useState<string[]>(organization.naics_codes || []);
  const [selectedCerts, setSelectedCerts] = useState<string[]>(organization.certifications || []);
  const [uei, setUei] = useState(organization.uei || "");
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [saving, setSaving] = useState(false);
  const [naicsMatchCount, setNaicsMatchCount] = useState(0);
  const [certMatchCount, setCertMatchCount] = useState(0);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // Check existing completion
  useEffect(() => {
    const done: number[] = [];
    if (organization.naics_codes?.length) done.push(1);
    if (organization.certifications?.length) done.push(2);
    if (organization.uei) done.push(3);
    setCompletedSteps(done);

    // Check calendar
    (async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("google_calendar_connected")
        .eq("organization_id", organization.id)
        .single();
      if (data?.google_calendar_connected) {
        setCalendarConnected(true);
        setCompletedSteps([...done, 4]);
      }
    })();
  }, [organization, supabase]);

  // NAICS search
  useEffect(() => {
    if (naicsSearch.length >= 2) {
      setNaicsSuggestions(searchNaics(naicsSearch));
    } else {
      setNaicsSuggestions([]);
    }
  }, [naicsSearch]);

  // Count matches for selected NAICS
  const countNaicsMatches = useCallback(async (codes: string[]) => {
    if (!codes.length) { setNaicsMatchCount(0); return; }
    let total = 0;
    for (const code of codes.slice(0, 5)) {
      const { count } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("naics_code", code)
        .in("source", ["sam_gov", "usaspending"])
        ;
      total += count ?? 0;
    }
    setNaicsMatchCount(total);
  }, [supabase]);

  const addNaics = (code: string) => {
    if (selectedNaics.includes(code)) return;
    const updated = [...selectedNaics, code];
    setSelectedNaics(updated);
    setNaicsSearch("");
    countNaicsMatches(updated);
  };

  const removeNaics = (code: string) => {
    const updated = selectedNaics.filter((c) => c !== code);
    setSelectedNaics(updated);
    countNaicsMatches(updated);
  };

  const saveNaics = async () => {
    setSaving(true);
    await supabase
      .from("organizations")
      .update({ naics_codes: selectedNaics })
      .eq("id", organization.id);
    setSaving(false);
    setCompletedSteps((s) => s.includes(1) ? s : [...s, 1]);
    setCelebration(`+${naicsMatchCount.toLocaleString()} matches unlocked!`);
    setTimeout(() => setCelebration(null), 3000);
  };

  const saveCerts = async () => {
    setSaving(true);
    await supabase
      .from("organizations")
      .update({ certifications: selectedCerts })
      .eq("id", organization.id);
    setSaving(false);

    // Count set-aside matches
    let count = 0;
    for (const cert of selectedCerts) {
      const keyword = cert.toLowerCase().substring(0, 4);
      const { count: c } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .ilike("set_aside_type", `%${keyword}%`)
        .in("source", ["sam_gov", "usaspending"])
        ;
      count += c ?? 0;
    }
    setCertMatchCount(count);
    setCompletedSteps((s) => s.includes(2) ? s : [...s, 2]);
    setCelebration(`+${count.toLocaleString()} set-aside matches unlocked!`);
    setTimeout(() => setCelebration(null), 3000);
  };

  const saveUei = async () => {
    if (!uei.trim()) return;
    setSaving(true);

    // Try to fetch from SAM.gov audit API
    try {
      const res = await fetch(`/api/audit?uei=${uei.trim()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.legalBusinessName) {
          await supabase
            .from("organizations")
            .update({
              uei: uei.trim(),
              name: data.legalBusinessName || organization.name,
              cage_code: data.cageCode || organization.cage_code,
              address: data.physicalAddress || organization.address,
            })
            .eq("id", organization.id);
          setCompletedSteps((s) => s.includes(3) ? s : [...s, 3]);
          setCelebration("Profile imported from SAM.gov!");
          setTimeout(() => setCelebration(null), 3000);
          setSaving(false);
          return;
        }
      }
    } catch {}

    // Fallback: just save UEI
    await supabase
      .from("organizations")
      .update({ uei: uei.trim() })
      .eq("id", organization.id);
    setCompletedSteps((s) => s.includes(3) ? s : [...s, 3]);
    setCelebration("UEI saved!");
    setTimeout(() => setCelebration(null), 3000);
    setSaving(false);
  };

  const connectCalendar = () => {
    window.location.href = "/api/calendar/connect";
  };

  const totalSteps = 4;
  const doneCount = completedSteps.length;
  const totalMatches = naicsMatchCount + certMatchCount;
  const allDone = doneCount >= totalSteps;

  const naicsLookup = NAICS_LOOKUP.reduce((m, n) => { m[n.code] = n.title; return m; }, {} as Record<string, string>);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-2xl overflow-y-auto"
        style={{ maxHeight: "70vh", animation: "slideUp 0.3s ease-out" }}
      >
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#94a3b8] hover:text-[#0f172a] text-xl"
          >
            &times;
          </button>

          {/* Celebration overlay */}
          {celebration && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div
                className="bg-white/95 backdrop-blur px-8 py-4 rounded-2xl shadow-xl text-center"
                style={{ animation: "countUp 0.4s ease-out" }}
              >
                <div className="text-3xl mb-1">&#10024;</div>
                <div className="text-lg font-bold text-[#059669]">{celebration}</div>
              </div>
            </div>
          )}

          {allDone ? (
            /* All complete celebration */
            <div className="text-center py-8">
              <div className="text-5xl mb-4">&#127881;</div>
              <h2 className="text-2xl font-bold text-[#0f172a] mb-2">Profile Complete</h2>
              <p className="text-[#64748b] mb-2">
                {totalMatches > 0
                  ? `${totalMatches.toLocaleString()} contracts matched to your business`
                  : "Your personalized contract feed is ready"}
              </p>
              <button
                onClick={() => { onClose(); window.location.reload(); }}
                className="mt-4 px-6 py-3 bg-[#2563eb] text-white font-bold rounded-xl hover:bg-[#3b82f6] transition-colors"
              >
                View My Matches
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-[#0f172a] mb-1">
                Unlock Your Full Contract Feed
              </h2>
              <p className="text-sm text-[#64748b] mb-4">
                You&apos;re seeing general contracts. Complete these steps to see opportunities matched specifically to your business.
              </p>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-[#94a3b8]">
                    {doneCount} of {totalSteps} complete
                  </span>
                  {totalMatches > 0 && (
                    <span className="text-xs font-bold text-[#059669]">
                      {totalMatches.toLocaleString()} matches unlocked
                    </span>
                  )}
                </div>
                <div className="w-full h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${(doneCount / totalSteps) * 100}%`,
                      background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                    }}
                  />
                </div>
              </div>

              {/* STEP 1: NAICS */}
              <div className={`border rounded-xl p-4 mb-3 transition-all ${completedSteps.includes(1) ? "border-[#22c55e] bg-[#f0fdf4]" : "border-[#e5e7eb]"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {completedSteps.includes(1) ? (
                    <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white flex items-center justify-center text-xs font-bold">&#10003;</span>
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold">1</span>
                  )}
                  <h3 className="text-sm font-bold text-[#0f172a]">What does your business do?</h3>
                </div>

                {!completedSteps.includes(1) && (
                  <div className="ml-8">
                    <input
                      type="text"
                      value={naicsSearch}
                      onChange={(e) => setNaicsSearch(e.target.value)}
                      placeholder="Type your industry... (e.g. IT consulting, construction, janitorial)"
                      className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 mb-2"
                    />

                    {/* Suggestions */}
                    {naicsSuggestions.length > 0 && (
                      <div className="border border-[#e5e7eb] rounded-lg mb-2 max-h-48 overflow-y-auto">
                        {naicsSuggestions.map((n) => (
                          <button
                            key={n.code}
                            onClick={() => addNaics(n.code)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[#f8fafc] border-b border-[#f1f5f9] last:border-0 flex items-center justify-between"
                          >
                            <span>
                              <span className="font-mono text-[#2563eb] mr-2">{n.code}</span>
                              <span className="text-[#0f172a]">{n.title}</span>
                            </span>
                            <span className="text-[10px] text-[#94a3b8]">+ Add</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Selected chips */}
                    {selectedNaics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {selectedNaics.map((code) => (
                          <span key={code} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#eff4ff] text-[#2563eb] text-xs font-medium rounded-full">
                            {code} — {naicsLookup[code] || "Custom"}
                            <button onClick={() => removeNaics(code)} className="ml-0.5 text-[#2563eb]/50 hover:text-[#2563eb]">&times;</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedNaics.length > 0 && (
                      <button
                        onClick={saveNaics}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : `Save NAICS Codes${naicsMatchCount > 0 ? ` (+${naicsMatchCount.toLocaleString()} matches)` : ""}`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 2: CERTIFICATIONS */}
              <div className={`border rounded-xl p-4 mb-3 transition-all ${completedSteps.includes(2) ? "border-[#22c55e] bg-[#f0fdf4]" : "border-[#e5e7eb]"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {completedSteps.includes(2) ? (
                    <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white flex items-center justify-center text-xs font-bold">&#10003;</span>
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold">2</span>
                  )}
                  <h3 className="text-sm font-bold text-[#0f172a]">What certifications do you have?</h3>
                </div>

                {!completedSteps.includes(2) && (
                  <div className="ml-8">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                      {CERTIFICATIONS.map((cert) => {
                        const selected = selectedCerts.includes(cert.id);
                        return (
                          <button
                            key={cert.id}
                            onClick={() =>
                              setSelectedCerts((prev) =>
                                selected
                                  ? prev.filter((c) => c !== cert.id)
                                  : [...prev, cert.id]
                              )
                            }
                            className={`p-3 rounded-lg border-2 text-left transition-all ${
                              selected
                                ? "border-[#2563eb] bg-[#eff4ff]"
                                : "border-[#e5e7eb] hover:border-[#cbd5e1]"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mb-1.5 ${selected ? "bg-[#2563eb] text-white" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                              {cert.icon}
                            </div>
                            <div className="text-xs font-bold text-[#0f172a]">{cert.label}</div>
                            <div className="text-[10px] text-[#94a3b8] leading-tight">{cert.desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedCerts.length > 0 && (
                      <button
                        onClick={saveCerts}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Certifications"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 3: UEI / SAM.gov */}
              <div className={`border rounded-xl p-4 mb-3 transition-all ${completedSteps.includes(3) ? "border-[#22c55e] bg-[#f0fdf4]" : "border-[#e5e7eb]"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {completedSteps.includes(3) ? (
                    <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white flex items-center justify-center text-xs font-bold">&#10003;</span>
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold">3</span>
                  )}
                  <h3 className="text-sm font-bold text-[#0f172a]">Connect your SAM.gov profile</h3>
                </div>

                {!completedSteps.includes(3) && (
                  <div className="ml-8">
                    <p className="text-xs text-[#64748b] mb-2">
                      Enter your UEI and we&apos;ll import your NAICS codes, certifications, and address automatically.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={uei}
                        onChange={(e) => setUei(e.target.value.toUpperCase())}
                        placeholder="Enter your UEI (e.g. ZQGGQQK69CP7)"
                        className="flex-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] font-mono"
                        maxLength={13}
                      />
                      <button
                        onClick={saveUei}
                        disabled={saving || !uei.trim()}
                        className="px-4 py-2 text-sm font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
                      >
                        {saving ? "Importing..." : "Import"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 4: Google Calendar */}
              <div className={`border rounded-xl p-4 mb-3 transition-all ${completedSteps.includes(4) ? "border-[#22c55e] bg-[#f0fdf4]" : "border-[#e5e7eb]"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {completedSteps.includes(4) ? (
                    <span className="w-6 h-6 rounded-full bg-[#22c55e] text-white flex items-center justify-center text-xs font-bold">&#10003;</span>
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold">4</span>
                  )}
                  <h3 className="text-sm font-bold text-[#0f172a]">Get deadline reminders</h3>
                </div>

                {!completedSteps.includes(4) && (
                  <div className="ml-8">
                    <p className="text-xs text-[#64748b] mb-2">
                      Connect Google Calendar to get contract deadline reminders on your phone.
                    </p>
                    <button
                      onClick={connectCalendar}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f8fafc] transition-colors"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Connect Google Calendar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Banner for incomplete profile (shown above opportunity feed)
export function ProfileBanner() {
  const { organization } = useDashboard();
  const isIncomplete =
    !organization.naics_codes?.length || !organization.certifications?.length;

  if (!isIncomplete) return null;

  return (
    <div className="mb-4 px-4 py-2.5 bg-gradient-to-r from-[#eff4ff] to-[#f5f3ff] border border-[#e0e7ff] rounded-xl flex items-center justify-between">
      <span className="text-xs text-[#64748b]">
        Showing general results. <span className="font-medium text-[#2563eb]">Unlock personalized matches</span> by completing your profile.
      </span>
      <button
        onClick={() => {
          const btn = document.querySelector("[data-unlock-trigger]") as HTMLElement;
          btn?.click();
        }}
        className="text-xs font-medium text-[#2563eb] hover:text-[#1d4ed8] shrink-0 ml-2"
      >
        Complete Profile
      </button>
    </div>
  );
}
