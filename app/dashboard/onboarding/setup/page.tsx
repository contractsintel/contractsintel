"use client";

import { useDashboard } from "../../context";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR"];
const STATE_NAMES: Record<string, string> = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"Washington DC",PR:"Puerto Rico"};

const CERTS = [
  { id: "8(a)", label: "8(a)", desc: "SBA 8(a) Business Development" },
  { id: "HUBZone", label: "HUBZone", desc: "Historically Underutilized Business Zone" },
  { id: "WOSB", label: "WOSB", desc: "Women-Owned Small Business" },
  { id: "EDWOSB", label: "EDWOSB", desc: "Economically Disadvantaged WOSB" },
  { id: "SDVOSB", label: "SDVOSB", desc: "Service-Disabled Veteran-Owned" },
  { id: "Small Business", label: "Small Business", desc: "SBA Small Business" },
  { id: "Service-Disabled Veteran", label: "Service-Disabled Veteran", desc: "Veteran-owned" },
];

type TabKey = "organization" | "capabilities" | "preferences";

export default function OnboardingSetupPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>("organization");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState("");
  const [tab1Attempted, setTab1Attempted] = useState(false);
  const [tab2Attempted, setTab2Attempted] = useState(false);
  const [tab3Attempted, setTab3Attempted] = useState(false);
  const [pullingSam, setPullingSam] = useState(false);
  const [samSuccess, setSamSuccess] = useState(false);
  const [samError, setSamError] = useState("");

  // Tab 1: Organization
  const [companyName, setCompanyName] = useState(organization.name || "");
  const [uei, setUei] = useState(organization.uei || "");
  const [cageCode, setCageCode] = useState(organization.cage_code || "");
  const [location, setLocation] = useState<"us" | "outside">("us");
  const [serviceArea, setServiceArea] = useState<"nationwide" | "specific">("nationwide");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [showStateModal, setShowStateModal] = useState(false);
  const [stateSearch, setStateSearch] = useState("");

  // Tab 2: Capabilities
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [generatingKeywords, setGeneratingKeywords] = useState(false);
  const [manualKeyword, setManualKeyword] = useState("");

  // Tab 3: Preferences
  const [certs, setCerts] = useState<string[]>(organization.certifications || []);
  const [selectedNaics, setSelectedNaics] = useState<string[]>(organization.naics_codes || []);
  const [naicsSuggestions, setNaicsSuggestions] = useState<{code: string; title: string}[]>([]);
  const [loadingNaics, setLoadingNaics] = useState(false);
  const [naicsLoaded, setNaicsLoaded] = useState(false);
  const [showManualNaics, setShowManualNaics] = useState(false);
  const [manualNaicsCode, setManualNaicsCode] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [setAsidePref, setSetAsidePref] = useState<"matching" | "all">("all");

  // Auto-generate NAICS suggestions when entering Tab 3
  useEffect(() => {
    if (activeTab === "preferences" && !naicsLoaded && (description || selectedKeywords.length > 0)) {
      setLoadingNaics(true);
      fetch("/api/onboarding/naics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, keywords: selectedKeywords }),
      })
        .then(r => r.json())
        .then(data => { if (data.naics?.length) setNaicsSuggestions(data.naics); })
        .catch(() => {})
        .finally(() => { setLoadingNaics(false); setNaicsLoaded(true); });
    }
  }, [activeTab, naicsLoaded, description, selectedKeywords]);

  const showBanner = (msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(""), 4000);
  };

  const pullFromSam = async () => {
    if (!uei || uei.trim().length < 5) return;
    setPullingSam(true);
    setSamError("");
    setSamSuccess(false);
    try {
      const res = await fetch(`/api/audit?uei=${encodeURIComponent(uei.trim())}`);
      const data = await res.json();
      if (data.entity) {
        if (data.entity.legalBusinessName) setCompanyName(data.entity.legalBusinessName);
        if (data.entity.cageCode) setCageCode(data.entity.cageCode);
        setSamSuccess(true);
        setTimeout(() => setSamSuccess(false), 3000);
      } else if (data.legalBusinessName) {
        setCompanyName(data.legalBusinessName);
        if (data.cageCode) setCageCode(data.cageCode);
        setSamSuccess(true);
        setTimeout(() => setSamSuccess(false), 3000);
      } else {
        setSamError("Could not find this UEI in SAM.gov");
      }
    } catch {
      setSamError("Error connecting to SAM.gov. Try again.");
    }
    setPullingSam(false);
  };

  // Validation
  const tab1Valid = companyName.trim().length >= 2;
  const tab2Valid = projectName.trim().length > 0 && description.trim().length >= 20 && selectedKeywords.length >= 2;
  const tab3Valid = certs.length > 0 && selectedNaics.length > 0;
  if (activeTab === "preferences") console.log("TAB3 VALIDATION:", { certs, selectedNaics, tab3Valid });

  const saveOrganization = async () => {
    setTab1Attempted(true);
    if (!tab1Valid) return;
    setSaving(true);
    await supabase.from("organizations").update({
      name: companyName,
      uei: uei || null,
      cage_code: cageCode || null,
      address: { state: selectedStates.length ? selectedStates[0] : null, nationwide: serviceArea === "nationwide" },
    }).eq("id", organization.id);
    setSaving(false);
    showBanner("Organization info saved!");
    setActiveTab("capabilities");
  };

  const generateKeywords = async () => {
    if (!description.trim()) return;
    setGeneratingKeywords(true);
    try {
      const res = await fetch("/api/onboarding/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (data.keywords) setKeywords(data.keywords);
    } catch {}
    setGeneratingKeywords(false);
  };

  const saveCapabilities = async () => {
    setTab2Attempted(true);
    if (!tab2Valid) return;
    setSaving(true);
    await supabase.from("organizations").update({
      entity_description: description,
    }).eq("id", organization.id);
    setSaving(false);
    showBanner("Capabilities saved!");
    setActiveTab("preferences");
  };

  const [matching, setMatching] = useState(false);

  const saveAndExit = async () => {
    setTab3Attempted(true);
    if (!tab3Valid) return;
    setSaving(true);
    const minVal = minValue ? parseInt(minValue) : 0;
    const maxValNum = maxValue ? parseInt(maxValue) : 0;
    await supabase.from("organizations").update({
      certifications: certs,
      naics_codes: selectedNaics,
      keywords: selectedKeywords,
      serves_nationwide: serviceArea === "nationwide",
      service_states: selectedStates,
      min_contract_value: minVal,
      max_contract_value: maxValNum,
      setup_wizard_complete: true,
    }).eq("id", organization.id);
    setSaving(false);

    // Trigger matching engine
    setMatching(true);
    showBanner("Profile saved! Scanning opportunities...");
    try {
      await fetch("/api/matching/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: organization.id }),
      });
    } catch {}
    setMatching(false);
    router.push("/dashboard/onboarding");
  };

  const filteredStates = US_STATES.filter(s =>
    !stateSearch || STATE_NAMES[s]?.toLowerCase().includes(stateSearch.toLowerCase()) || s.toLowerCase().includes(stateSearch.toLowerCase())
  );

  return (
    <div className="max-w-[800px] mx-auto">
      {/* Success banner */}
      {banner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#ecfdf5] border-b border-[#a7f3d0] py-3 px-6 text-center text-[14px] text-[#059669] font-medium flex items-center justify-center gap-2"
             style={{animation: "fadeInUp 0.3s ease"}}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
          </svg>
          {banner}
        </div>
      )}

      {/* Back link */}
      <button onClick={() => router.push("/dashboard/onboarding")}
        className="text-[13px] text-[#2563eb] hover:text-[#1d4ed8] mb-6 inline-flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M15 19l-7-7 7-7"/></svg>
        Back to checklist
      </button>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-8">
        {([
          { key: "organization" as TabKey, label: "1. Organization" },
          { key: "capabilities" as TabKey, label: "2. Capabilities" },
          { key: "preferences" as TabKey, label: "3. Match Preferences" },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-[14px] font-medium rounded-lg border transition-all ${
              activeTab === tab.key
                ? "bg-[#eff6ff] border-[#bfdbfe] text-[#2563eb]"
                : "border-transparent text-[#6b7280] hover:text-[#111827] hover:bg-[#f3f4f6]"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Organization */}
      {activeTab === "organization" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-[20px] font-semibold text-[#111827] mb-1">Let&apos;s set up your business profile</h2>
            <p className="text-[13px] text-[#6b7280]">We use this information to match you with relevant contracts.</p>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">Company Name *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              className="w-full border border-[#e5e7eb] rounded-lg px-4 py-3 text-[14px] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 focus:outline-none" />
          </div>

          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">UEI Number</label>
            <div className="flex gap-2">
              <input value={uei} onChange={e => { setUei(e.target.value); setSamError(""); setSamSuccess(false); }}
                placeholder="e.g. ZQGGHJH74DW7"
                className="flex-1 border border-[#e5e7eb] rounded-lg px-4 py-3 text-[14px] focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 focus:outline-none" />
              <button onClick={pullFromSam} disabled={pullingSam || !uei || uei.trim().length < 5}
                className={`px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all shrink-0 ${
                  pullingSam ? "bg-[#e5e7eb] text-[#9ca3af]" : "bg-[#4f46e5] text-white hover:bg-[#4338ca]"
                } disabled:opacity-40`}>
                {pullingSam ? "Pulling..." : "Pull from SAM.gov"}
              </button>
            </div>
            {samSuccess && <p className="text-[13px] text-[#059669] mt-2">✓ Data pulled from SAM.gov</p>}
            {samError && <p className="text-[13px] text-[#dc2626] mt-2">{samError}</p>}
            <p className="text-[12px] text-[#6b7280] mt-1.5">
              Your Unique Entity ID from SAM.gov registration.
              <a href="https://sam.gov" target="_blank" rel="noopener noreferrer"
                 className="text-[#4f46e5] hover:underline ml-1">
                Look up your UEI →
              </a>
            </p>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">CAGE Code</label>
            <input value={cageCode} onChange={e => setCageCode(e.target.value)}
              className="w-full border border-[#e5e7eb] rounded-lg px-4 py-3 text-[14px] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 focus:outline-none" />
          </div>

          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">Where is your business based? *</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-[#e5e7eb] rounded-lg cursor-pointer hover:bg-[#f9fafb]">
                <input type="radio" checked={location === "us"} onChange={() => setLocation("us")} className="w-4 h-4 text-[#2563eb]" />
                <span className="text-[14px] text-[#374151]">Inside the United States</span>
              </label>
              {location === "us" && (
                <div className="ml-7 space-y-2 p-3 bg-[#f9fafb] rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" checked={serviceArea === "specific"} onChange={() => setServiceArea("specific")} className="w-4 h-4 text-[#2563eb]" />
                    <span className="text-[14px] text-[#374151]">We serve specific states/regions</span>
                  </label>
                  {serviceArea === "specific" && (
                    <div className="ml-7">
                      <button onClick={() => setShowStateModal(true)}
                        className="text-[13px] text-[#2563eb] hover:text-[#1d4ed8] font-medium">
                        + Select states {selectedStates.length > 0 && `(${selectedStates.length} selected)`}
                      </button>
                    </div>
                  )}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" checked={serviceArea === "nationwide"} onChange={() => setServiceArea("nationwide")} className="w-4 h-4 text-[#2563eb]" />
                    <div>
                      <span className="text-[14px] text-[#374151]">We serve nationwide</span>
                      <p className="text-[12px] text-[#6b7280]">We&apos;ll show contracts from all sources.</p>
                    </div>
                  </label>
                </div>
              )}
              <label className="flex items-center gap-3 p-3 border border-[#e5e7eb] rounded-lg cursor-pointer hover:bg-[#f9fafb]">
                <input type="radio" checked={location === "outside"} onChange={() => setLocation("outside")} className="w-4 h-4 text-[#2563eb]" />
                <span className="text-[14px] text-[#374151]">Outside the United States</span>
              </label>
            </div>
          </div>

          {tab1Attempted && !companyName.trim() && <p className="text-[13px] text-[#dc2626] mt-1.5">Company name is required</p>}

          <button onClick={saveOrganization} disabled={saving}
            className={`px-6 py-3 rounded-xl text-[15px] font-semibold transition-all mt-2 ${
              tab1Valid
                ? "bg-[#4f46e5] text-white hover:bg-[#4338ca] cursor-pointer"
                : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
            }`}>
            {saving ? "Saving..." : "Save and Continue →"}
          </button>

          <div className="mt-8 p-4 bg-[#eef2ff] border border-[#c7d2fe] rounded-xl">
            <p className="text-[13px] text-[#4338ca] leading-relaxed">
              <strong>What happens next:</strong> We&apos;ll use your profile to scan SAM.gov for active contract opportunities and USASpending.gov for expiring contracts you can compete for. Your first matched contracts will appear on your dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Capabilities */}
      {activeTab === "capabilities" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-[20px] font-semibold text-[#111827] mb-1">Tell us about your capabilities</h2>
            <p className="text-[13px] text-[#6b7280]">We&apos;ll use this to generate keyword suggestions for contract matching.</p>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">Project Name *</label>
            <input value={projectName} onChange={e => setProjectName(e.target.value)}
              placeholder="e.g. Federal IT Contracts"
              className="w-full border border-[#e5e7eb] rounded-lg px-4 py-3 text-[14px] focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 focus:outline-none" />
          </div>

          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">
              Tell us what government services you provide *
            </label>
            <p className="text-[12px] text-[#6b7280] mb-2">Example: We provide IT support services, cybersecurity assessments, and cloud migration for federal agencies.</p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
              placeholder="Describe your business services, who you serve, and your specialties..."
              className="w-full border border-[#e5e7eb] rounded-lg px-4 py-3 text-[14px] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 focus:outline-none resize-none" />
          </div>

          <button onClick={generateKeywords} disabled={generatingKeywords || !description.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white rounded-lg text-[14px] font-semibold hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2">
            {generatingKeywords ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating suggestions...</>
            ) : (
              <><span>✨</span> Generate keyword suggestions</>
            )}
          </button>

          {keywords.length > 0 && (
            <div>
              <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">Select your best-fit keywords *</label>
              <p className="text-[12px] text-[#6b7280] mb-3">Pick 2-5 keywords we&apos;ll use to match you with contracts.</p>
              <div className="flex flex-wrap gap-2">
                {keywords.map(kw => {
                  const isSelected = selectedKeywords.includes(kw);
                  return (
                    <button key={kw} onClick={() => {
                      setSelectedKeywords(prev => isSelected ? prev.filter(k => k !== kw) : [...prev, kw]);
                    }}
                      className={`px-3 py-1.5 text-[13px] rounded-lg border transition-all ${
                        isSelected
                          ? "border-[#059669] text-[#059669] bg-[#ecfdf5]"
                          : "border-[#e5e7eb] text-[#4b5563] bg-white hover:border-[#2563eb] hover:text-[#2563eb]"
                      }`}>
                      {isSelected ? `× ${kw}` : `+ ${kw}`}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input value={manualKeyword} onChange={e => setManualKeyword(e.target.value)}
                  placeholder="Add keyword manually..."
                  className="border border-[#e5e7eb] rounded-lg px-3 py-2 text-[13px] focus:border-[#2563eb] focus:outline-none"
                  onKeyDown={e => {
                    if (e.key === "Enter" && manualKeyword.trim()) {
                      setSelectedKeywords(prev => [...prev, manualKeyword.trim()]);
                      setManualKeyword("");
                    }
                  }} />
              </div>
            </div>
          )}

          {tab2Attempted && !projectName.trim() && <p className="text-[13px] text-[#dc2626] mt-1.5">Project name is required</p>}
          {tab2Attempted && description.trim().length < 20 && <p className="text-[13px] text-[#dc2626] mt-1.5">Please describe your services (minimum 20 characters)</p>}
          {tab2Attempted && keywords.length > 0 && selectedKeywords.length < 2 && <p className="text-[13px] text-[#dc2626] mt-1.5">Select at least 2 keywords</p>}

          <button onClick={saveCapabilities} disabled={saving}
            className={`px-6 py-3 rounded-xl text-[15px] font-semibold transition-all mt-2 ${
              tab2Valid
                ? "bg-[#4f46e5] text-white hover:bg-[#4338ca] cursor-pointer"
                : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
            }`}>
            {saving ? "Saving..." : "Next →"}
          </button>
        </div>
      )}

      {/* Tab 3: Match Preferences */}
      {activeTab === "preferences" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-[20px] font-semibold text-[#111827] mb-1">Tell us a few final details</h2>
            <p className="text-[13px] text-[#6b7280]">These help us find the best contract matches for your business.</p>
          </div>

          {/* Certifications — rich card buttons */}
          <div>
            <p className="text-[14px] font-semibold text-[#111827] mb-1">Certifications *</p>
            <p className="text-[13px] text-[#6b7280] mb-3">Select all certifications your business holds.</p>
            <div className="space-y-2">
              {[
                { key: "8(a)", label: "8(a)", desc: "SBA 8(a) Business Development", sel: "bg-[#eff6ff] border-[#2563eb] text-[#2563eb]" },
                { key: "HUBZone", label: "HUBZone", desc: "Historically Underutilized Business Zone", sel: "bg-[#ecfdf5] border-[#059669] text-[#059669]" },
                { key: "WOSB", label: "WOSB", desc: "Women-Owned Small Business", sel: "bg-[#f5f3ff] border-[#7c3aed] text-[#7c3aed]" },
                { key: "EDWOSB", label: "EDWOSB", desc: "Economically Disadvantaged WOSB", sel: "bg-[#f5f3ff] border-[#7c3aed] text-[#7c3aed]" },
                { key: "SDVOSB", label: "SDVOSB", desc: "Service-Disabled Veteran-Owned", sel: "bg-[#fef2f2] border-[#dc2626] text-[#dc2626]" },
                { key: "Small Business", label: "Small Business", desc: "SBA Small Business", sel: "bg-[#fffbeb] border-[#d97706] text-[#d97706]" },
                { key: "Service-Disabled Veteran", label: "Service-Disabled Veteran", desc: "Veteran-owned", sel: "bg-[#fef2f2] border-[#dc2626] text-[#dc2626]" },
              ].map(cert => {
                const on = certs.includes(cert.key);
                return (
                  <button key={cert.key}
                    onClick={() => setCerts(prev => on ? prev.filter(c => c !== cert.key) : [...prev, cert.key])}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-150 text-left w-full ${
                      on ? cert.sel : "bg-white border-[#e5e7eb] hover:border-[#d1d5db]"
                    }`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${on ? "bg-current" : "border-2 border-[#d1d5db]"}`}>
                      {on && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    <div>
                      <div className={`text-[14px] font-semibold ${on ? "" : "text-[#111827]"}`}>{cert.label}</div>
                      <div className={`text-[12px] ${on ? "opacity-75" : "text-[#6b7280]"}`}>{cert.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {certs.length > 0 && <p className="text-[12px] text-[#059669] mt-2 font-medium">{certs.length} certification{certs.length > 1 ? "s" : ""} selected</p>}
          </div>

          {/* NAICS Codes — AI-generated pill selector */}
          <div>
            <p className="text-[14px] font-semibold text-[#111827] mb-1">NAICS Codes *</p>
            <p className="text-[13px] text-[#6b7280] mb-3">Select the codes that best describe your services. We use these to match you with relevant contracts.</p>

            {loadingNaics ? (
              <div className="flex items-center gap-2 text-[13px] text-[#4f46e5] py-4">
                <div className="w-4 h-4 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                Analyzing your services to suggest NAICS codes...
              </div>
            ) : naicsSuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {naicsSuggestions.map(item => {
                  const on = selectedNaics.includes(item.code);
                  return (
                    <button key={item.code}
                      onClick={() => setSelectedNaics(prev => on ? prev.filter(c => c !== item.code) : [...prev, item.code])}
                      className={`px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                        on
                          ? "bg-[#ecfdf5] border-2 border-[#059669] text-[#059669] font-medium"
                          : "bg-white border border-[#e5e7eb] text-[#4b5563] hover:border-[#4f46e5] hover:text-[#4f46e5]"
                      }`}>
                      <span className="font-mono font-semibold">{item.code}</span>
                      <span className="ml-1.5 text-[12px] opacity-75">— {item.title}</span>
                      {on && <span className="ml-2">×</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-[#9ca3af] py-2">Complete Tab 2 first to get AI-generated NAICS suggestions, or add codes manually below.</p>
            )}

            {selectedNaics.length > 0 && <p className="text-[12px] text-[#059669] mt-2 font-medium">{selectedNaics.length} code{selectedNaics.length > 1 ? "s" : ""} selected</p>}

            <div className="mt-3">
              <button onClick={() => { setShowManualNaics(!showManualNaics); setManualNaicsCode(""); }}
                className="text-[13px] text-[#4f46e5] hover:text-[#4338ca]">
                {showManualNaics ? "- Cancel manual entry" : "+ Add a NAICS code manually"}
              </button>
              {showManualNaics && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="text" placeholder="Enter 6-digit code" maxLength={6}
                    value={manualNaicsCode}
                    onChange={e => setManualNaicsCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => {
                      if (e.key === "Enter" && manualNaicsCode.length === 6) {
                        if (!selectedNaics.includes(manualNaicsCode)) setSelectedNaics(prev => [...prev, manualNaicsCode]);
                        setManualNaicsCode(""); setShowManualNaics(false);
                      }
                    }}
                    className="w-[140px] px-3 py-2 text-[14px] border border-[#e5e7eb] rounded-lg font-mono focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10"
                    autoFocus />
                  <button onClick={() => {
                    if (manualNaicsCode.length === 6 && !selectedNaics.includes(manualNaicsCode)) {
                      setSelectedNaics(prev => [...prev, manualNaicsCode]);
                      setManualNaicsCode("");
                      setShowManualNaics(false);
                    }
                  }}
                    disabled={manualNaicsCode.length !== 6}
                    className={`px-3 py-2 rounded-lg text-[13px] font-medium ${
                      manualNaicsCode.length === 6 ? "bg-[#4f46e5] text-white" : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
                    }`}>
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Contract size */}
          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-1.5">Contract size preference</label>
            <div className="flex items-center gap-3">
              <select value={minValue} onChange={e => setMinValue(e.target.value)}
                className="border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-[14px] focus:border-[#4f46e5] focus:outline-none">
                <option value="">No minimum</option>
                <option value="25000">$25K</option>
                <option value="50000">$50K</option>
                <option value="100000">$100K</option>
                <option value="250000">$250K</option>
                <option value="500000">$500K</option>
                <option value="1000000">$1M</option>
              </select>
              <span className="text-[13px] text-[#6b7280]">to</span>
              <select value={maxValue} onChange={e => setMaxValue(e.target.value)}
                className="border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-[14px] focus:border-[#4f46e5] focus:outline-none">
                <option value="">No maximum</option>
                <option value="100000">$100K</option>
                <option value="250000">$250K</option>
                <option value="500000">$500K</option>
                <option value="1000000">$1M</option>
                <option value="5000000">$5M</option>
                <option value="10000000">$10M</option>
              </select>
            </div>
          </div>

          {/* Set-aside preference */}
          <div>
            <label className="text-[14px] font-semibold text-[#111827] block mb-2">Set-aside preference</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" checked={setAsidePref === "matching"} onChange={() => setSetAsidePref("matching")} className="w-4 h-4 text-[#4f46e5]" />
                <span className="text-[14px] text-[#374151]">Only show contracts with set-asides matching my certifications</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" checked={setAsidePref === "all"} onChange={() => setSetAsidePref("all")} className="w-4 h-4 text-[#4f46e5]" />
                <span className="text-[14px] text-[#374151]">Show all contracts (including full &amp; open competition)</span>
              </label>
            </div>
          </div>

          {/* Validation errors */}
          {tab3Attempted && certs.length === 0 && <p className="text-[13px] text-[#dc2626]">Select at least one certification</p>}
          {tab3Attempted && selectedNaics.length === 0 && <p className="text-[13px] text-[#dc2626]">Select at least one NAICS code</p>}

          <button onClick={saveAndExit} disabled={saving || matching}
            className={`px-6 py-3 rounded-xl text-[15px] font-semibold transition-all ${
              tab3Valid
                ? "bg-[#4f46e5] text-white hover:bg-[#4338ca] cursor-pointer"
                : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
            }`}>
            {matching ? "Scanning 45,000+ opportunities..." : saving ? "Saving..." : "Save and Exit"}
          </button>
        </div>
      )}

      {/* State selector modal */}
      {showStateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[4px]" onClick={() => setShowStateModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#111827] mb-1">Select states and regions</h3>
            <p className="text-[13px] text-[#6b7280] mb-4">Where can your business perform work?</p>
            <div className="relative mb-4">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input value={stateSearch} onChange={e => setStateSearch(e.target.value)} placeholder="Search states..."
                className="w-full pl-9 pr-3 py-2.5 text-[14px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb]" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredStates.map(s => (
                <label key={s} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-[#f9fafb] cursor-pointer">
                  <input type="checkbox" checked={selectedStates.includes(s)}
                    onChange={e => setSelectedStates(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#2563eb] focus:ring-[#2563eb] focus:ring-offset-0" />
                  <span className="text-[14px] text-[#374151]">{STATE_NAMES[s] || s}</span>
                </label>
              ))}
            </div>
            <button onClick={() => setShowStateModal(false)}
              className="mt-4 w-full py-2.5 bg-[#2563eb] text-white rounded-lg text-[14px] font-semibold hover:bg-[#1d4ed8]">
              Confirm ({selectedStates.length} selected)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
