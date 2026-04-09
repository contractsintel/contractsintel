"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tierLabel } from "@/lib/feature-gate";
import { HelpButton } from "../help-panel";

const CERTIFICATIONS = ["8(a)", "HUBZone", "WOSB", "EDWOSB", "SDVOSB", "Small Business", "Service-Disabled Veteran"];

const CERT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "8(a)": { bg: "bg-[#eff4ff]", text: "text-[#2563eb]", border: "border-[#2563eb]" },
  "HUBZone": { bg: "bg-[#ecfdf5]", text: "text-[#059669]", border: "border-[#059669]" },
  "WOSB": { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", border: "border-[#7c3aed]" },
  "EDWOSB": { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", border: "border-[#7c3aed]" },
  "SDVOSB": { bg: "bg-[#fef2f2]", text: "text-[#dc2626]", border: "border-[#dc2626]" },
  "Small Business": { bg: "bg-[#fffbeb]", text: "text-[#d97706]", border: "border-[#d97706]" },
  "Service-Disabled Veteran": { bg: "bg-[#fef2f2]", text: "text-[#dc2626]", border: "border-[#dc2626]" },
};
const GEO_OPTIONS = ["Nationwide", "DC Metro", "Northeast", "Southeast", "Midwest", "Southwest", "West Coast", "Pacific"];
const SIZE_OPTIONS = ["Micro (<$150K)", "Small ($150K-$750K)", "Medium ($750K-$5M)", "Large ($5M+)"];

export default function SettingsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const router = useRouter();

  // Company Profile
  const [companyName, setCompanyName] = useState(organization.name ?? "");
  const [uei, setUei] = useState(organization.uei ?? "");
  const [cageCode, setCageCode] = useState(organization.cage_code ?? "");
  const [certs, setCerts] = useState<string[]>(organization.certifications ?? []);
  const [naicsCodes, setNaicsCodes] = useState((organization.naics_codes ?? []).join(", "));
  const [address, setAddress] = useState(organization.address ?? "");

  // Preferences
  const [geography, setGeography] = useState<string[]>([]);
  const [contractSize, setContractSize] = useState<string[]>([]);
  const [agencies, setAgencies] = useState("");
  const [minScore, setMinScore] = useState(50);

  // Notifications — hydrated from organization.notification_preferences JSONB on mount
  const prefs = (organization.notification_preferences || {}) as Record<string, any>;
  const [digestEnabled, setDigestEnabled] = useState<boolean>(prefs.daily_digest ?? true);
  const [complianceAlerts, setComplianceAlerts] = useState<boolean>(prefs.compliance_alerts ?? true);
  const [deadlineReminders, setDeadlineReminders] = useState<boolean>(prefs.deadline_reminders ?? true);
  const [weeklyReport, setWeeklyReport] = useState<boolean>(prefs.weekly_report ?? true);
  const [digestTime, setDigestTime] = useState<string>(prefs.digest_time ?? "08:00");
  const [cadence, setCadence] = useState<string>(prefs.cadence ?? "daily");
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [savedNotifs, setSavedNotifs] = useState(false);

  // CMMC
  const [cmmcLevel, setCmmcLevel] = useState("1");

  // Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshingSam, setRefreshingSam] = useState(false);

  // Scraper run data
  const [scraperRuns, setScraperRuns] = useState<any[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});

  // Load scraper run data
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("scraper_runs")
          .select("*")
          .order("completed_at", { ascending: false })
          .limit(200);
        setScraperRuns(data ?? []);
      } catch {
        // scraper_runs table may not exist yet
      }

      // Fetch opportunity counts per source
      try {
        const sources = ["sam_gov", "usaspending", "grants_gov", "state_local", "military_defense", "sbir_sttr", "forecasts", "federal_civilian", "fpds_feed"];
        const counts: Record<string, number> = {};
        for (const src of sources) {
          const { count } = await supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("source", src);
          counts[src] = count ?? 0;
        }
        setSourceCounts(counts);
      } catch {
        // opportunities table may not exist yet
      }
    })();
  }, []);

  // Re-hydrate notification prefs whenever the org context changes
  useEffect(() => {
    const p = (organization.notification_preferences || {}) as Record<string, any>;
    if (typeof p.daily_digest === "boolean") setDigestEnabled(p.daily_digest);
    if (typeof p.compliance_alerts === "boolean") setComplianceAlerts(p.compliance_alerts);
    if (typeof p.deadline_reminders === "boolean") setDeadlineReminders(p.deadline_reminders);
    if (typeof p.weekly_report === "boolean") setWeeklyReport(p.weekly_report);
    if (typeof p.digest_time === "string") setDigestTime(p.digest_time);
    if (typeof p.cadence === "string") setCadence(p.cadence);
  }, [organization]);

  const saveNotifications = async () => {
    setSavingNotifs(true);
    const notification_preferences = {
      daily_digest: digestEnabled,
      compliance_alerts: complianceAlerts,
      deadline_reminders: deadlineReminders,
      weekly_report: weeklyReport,
      digest_time: digestTime,
      cadence,
      updated_at: new Date().toISOString(),
    };
    await supabase
      .from("organizations")
      .update({ notification_preferences })
      .eq("id", organization.id);
    setSavingNotifs(false);
    setSavedNotifs(true);
    setTimeout(() => setSavedNotifs(false), 2500);
  };

  const toggleCert = (c: string) =>
    setCerts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const toggleGeo = (g: string) =>
    setGeography((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  const toggleSize = (s: string) =>
    setContractSize((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("organizations")
      .update({
        name: companyName,
        uei,
        cage_code: cageCode,
        certifications: certs,
        naics_codes: naicsCodes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        address,
      })
      .eq("id", organization.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const refreshFromSam = async () => {
    if (!uei) return;
    setRefreshingSam(true);
    try {
      const res = await fetch(`/api/audit?uei=${uei}`);
      const data = await res.json();
      if (data.entity) {
        setCompanyName(data.entity.legalBusinessName ?? companyName);
        setCageCode(data.entity.cageCode ?? cageCode);
        setAddress(data.entity.physicalAddress ?? address);
      }
    } catch {
      // handle error
    }
    setRefreshingSam(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#6b7280"}} />
          <h1 className="ci-page-title">Settings</h1>
</div>
        <HelpButton page="settings" />
      </div>

      {/* Company Profile */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-5">Company Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">Company Name</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">UEI</label>
              <input type="text" value={uei} onChange={(e) => setUei(e.target.value)}
                placeholder="e.g. J7M9HPTGJ1S8"
                className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">CAGE Code</label>
              <input type="text" value={cageCode} onChange={(e) => setCageCode(e.target.value)}
                className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-2 font-medium uppercase tracking-wide">Certifications</label>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATIONS.map((c) => {
                const colors = CERT_COLORS[c] ?? { bg: "bg-[#f1f5f9]", text: "text-[#94a3b8]", border: "border-[#1e2535]" };
                return (
                  <button key={c} type="button" onClick={() => toggleCert(c)}
                    className={`px-3 py-1.5 text-xs border transition-colors ${certs.includes(c)
                      ? `${colors.border} ${colors.bg} ${colors.text}`
                      : "bg-[#f1f5f9] text-[#94a3b8] border-[#1e2535]"}`}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">NAICS Codes (comma-separated)</label>
            <input type="text" value={naicsCodes} onChange={(e) => setNaicsCodes(e.target.value)}
              placeholder="541511, 541512, 541330"
              className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#2563eb] text-white px-6 py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50">
              {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
            </button>
            <button onClick={refreshFromSam} disabled={refreshingSam || !uei}
              className="border border-[#1e2535] text-[#8b9ab5] px-6 py-3 text-sm hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors disabled:opacity-30">
              {refreshingSam ? "Refreshing..." : "Refresh from SAM.gov"}
            </button>
          </div>
        </div>
      </section>

      {/* Opportunity Preferences */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-5">Opportunity Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-2 font-medium uppercase tracking-wide">Geography</label>
            <div className="flex flex-wrap gap-2">
              {GEO_OPTIONS.map((g) => (
                <button key={g} type="button" onClick={() => toggleGeo(g)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${geography.includes(g)
                    ? "border-[#2563eb] bg-[#2563eb]/10 text-[#3b82f6]"
                    : "border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548]"}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-2 font-medium uppercase tracking-wide">Contract Size</label>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${contractSize.includes(s)
                    ? "border-[#2563eb] bg-[#2563eb]/10 text-[#3b82f6]"
                    : "border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548]"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">Preferred Agencies (comma-separated)</label>
            <input type="text" value={agencies} onChange={(e) => setAgencies(e.target.value)}
              placeholder="DoD, VA, GSA, DHS..."
              className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">
              Minimum Match Score: {minScore}
            </label>
            <input type="range" min={0} max={100} step={5} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-[#2563eb]" />
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-4">Subscription</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#e8edf8]">
              Current plan: <span className="text-[#3b82f6] font-medium">{tierLabel(organization.plan)}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {organization.stripe_customer_id && (
              <a href="/api/stripe/portal" className="px-4 py-2 text-xs border border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548] transition-colors">
                Manage Billing
              </a>
            )}
            {organization.plan !== "team" && (
              <a href="https://buy.stripe.com/6oUdR95EN3467WHaGS5wI03" target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors">
                Upgrade to BD Pro
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-5">Notifications</h2>
        <div className="space-y-3">
          {[
            { label: "Daily Digest", desc: "Morning email with new matches", value: digestEnabled, set: setDigestEnabled },
            { label: "Compliance Alerts", desc: "Urgent compliance deadline warnings", value: complianceAlerts, set: setComplianceAlerts },
            { label: "Deadline Reminders", desc: "Bid deadline reminders (3d, 1d, same day)", value: deadlineReminders, set: setDeadlineReminders },
            { label: "Weekly Report", desc: "Pipeline summary and win/loss metrics", value: weeklyReport, set: setWeeklyReport },
          ].map((n) => (
            <label key={n.label} className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-[#e8edf8]">{n.label}</span>
                <p className="text-xs text-[#4a5a75]">{n.desc}</p>
              </div>
              <button
                onClick={() => n.set(!n.value)}
                className={`w-10 h-5 flex items-center transition-colors ${n.value ? "bg-[#2563eb]" : "bg-[#e5e7eb]"}`}
              >
                <div className={`w-4 h-4 bg-white transition-transform ${n.value ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-[#1e2535]">
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">Digest Time</label>
            <input
              type="time"
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
              className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">Cadence</label>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              className="w-full bg-white border border-[#1e2535] text-[#e8edf8] px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
            >
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays only</option>
              <option value="weekly">Weekly (Mondays)</option>
              <option value="off">Off</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={saveNotifications}
            disabled={savingNotifs}
            className="px-4 py-2 text-sm bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
          >
            {savingNotifs ? "Saving..." : "Save Notification Settings"}
          </button>
          {savedNotifs && (
            <span className="text-xs text-[#059669] font-medium">✓ Saved</span>
          )}
        </div>
      </section>

      {/* CMMC Status */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-4">CMMC Status</h2>
        <div>
          <label className="block text-xs text-[#8b9ab5] mb-1.5 font-medium uppercase tracking-wide">Target Level</label>
          <select value={cmmcLevel} onChange={(e) => setCmmcLevel(e.target.value)}
            className="bg-white border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]">
            <option value="1">Level 1 — Basic Cyber Hygiene</option>
            <option value="2">Level 2 — Advanced Cyber Hygiene</option>
            <option value="3">Level 3 — Expert</option>
          </select>
        </div>
      </section>

      {/* Google Calendar */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-4">Google Calendar</h2>
        {calendarConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#22c55e]" />
              <span className="text-sm text-[#e8edf8]">Connected</span>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-[#8b9ab5]">Sync bid deadlines</span>
              <div className="w-10 h-5 bg-[#2563eb] flex items-center">
                <div className="w-4 h-4 bg-white translate-x-5" />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-[#8b9ab5]">Sync compliance deadlines</span>
              <div className="w-10 h-5 bg-[#2563eb] flex items-center">
                <div className="w-4 h-4 bg-white translate-x-5" />
              </div>
            </label>
            <button
              onClick={() => setCalendarConnected(false)}
              className="text-xs text-[#ef4444] hover:text-[#f87171] transition-colors"
            >
              Disconnect Calendar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCalendarConnected(true)}
            className="border border-[#1e2535] text-[#8b9ab5] px-4 py-2 text-sm hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors"
          >
            Connect Google Calendar
          </button>
        )}
      </section>

      {/* Data Sources */}
      <section className="border border-[#1e2535]  bg-white p-6 mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-5">Data Sources</h2>
        {(() => {
          const lastRun = scraperRuns.length > 0 ? new Date(scraperRuns[0].completed_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }) : "Not yet run";

          const sourceGroups = [
            { label: "Federal Sources (25+)", key: "federal", sources: ["sam_gov", "usaspending", "grants_gov", "federal_civilian"], color: "#2563eb", intervalHours: 2 },
            { label: "State Sources (55)", key: "state", sources: ["state_local"], color: "#059669", intervalHours: 4 },
            { label: "Military Sources (14)", key: "military", sources: ["military_defense"], color: "#475569", intervalHours: 6 },
            { label: "SBIR/STTR Sources (7)", key: "sbir", sources: ["sbir_sttr"], color: "#7c3aed", intervalHours: 6 },
            { label: "Forecasts & Intel (5)", key: "forecasts", sources: ["forecasts", "fpds_feed"], color: "#d97706", intervalHours: 12 },
            { label: "Subcontracting (2)", key: "subcontracting", sources: ["subcontracting"], color: "#0d9488", intervalHours: 24 },
          ];

          const minutesAgo = (dateStr: string) => {
            const diff = Date.now() - new Date(dateStr).getTime();
            return Math.round(diff / 60000);
          };

          const formatAgo = (mins: number) => {
            if (mins < 1) return "Just now";
            if (mins < 60) return `${mins} min ago`;
            if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
            return `${Math.round(mins / 1440)} days ago`;
          };

          return (
            <div className="space-y-3">
              <p className="text-xs text-[#4a5a75]">Last updated: {lastRun}</p>
              {sourceGroups.map((group) => {
                const runs = scraperRuns.filter((r: any) => group.sources.includes(r.source));
                const latestRun = runs[0];
                const status = latestRun ? (latestRun.status === "success" ? "Active" : latestRun.status === "stub" ? "Pending Setup" : "Error") : "Not yet run";
                const statusColor = latestRun?.status === "success" ? "#22c55e" : latestRun?.status === "stub" ? "#9ca3af" : latestRun ? "#ef4444" : "#9ca3af";
                const totalOpps = group.sources.reduce((s: number, src: string) => s + (sourceCounts[src] || 0), 0);
                const lastScrapedMins = latestRun?.completed_at ? minutesAgo(latestRun.completed_at) : null;
                const isStale = lastScrapedMins !== null && lastScrapedMins > group.intervalHours * 60 * 2;

                return (
                  <button
                    key={group.key}
                    onClick={() => setExpandedSource(expandedSource === group.key ? null : group.key)}
                    className="w-full flex flex-col py-2 px-3 border border-[#1e2535] hover:border-[#e2e8f0] transition-colors text-left"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-sm text-[#e8edf8]">{group.label}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                          <span className="text-xs text-[#8b9ab5]">{status}</span>
                        </div>
                        <span className="text-xs font-mono text-[#4a5a75]">{totalOpps.toLocaleString()} opportunities</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-1 ml-5">
                      <span className={`text-xs ${isStale ? "text-[#f59e0b] font-medium" : "text-[#4a5a75]"}`}>
                        {lastScrapedMins !== null
                          ? `Last scraped: ${formatAgo(lastScrapedMins)}${isStale ? " (overdue)" : ""}`
                          : "Not yet run"}
                      </span>
                      <span className="text-xs text-[#4a5a75]">
                        Runs every {group.intervalHours < 1 ? `${group.intervalHours * 60} min` : `${group.intervalHours} hr`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* Onboarding */}
      <section className="border border-[#1e2535] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
        <h2 className="text-xs text-[#4a5a75] font-medium uppercase tracking-wide mb-4">Onboarding</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              localStorage.removeItem("ci_tour_completed");
              window.location.href = "/dashboard";
            }}
            className="border border-[#1e2535] text-[#8b9ab5] px-4 py-2 text-sm hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors"
          >
            Restart Product Tour
          </button>
          <a
            href="/dashboard/get-started"
            className="border border-[#1e2535] text-[#8b9ab5] px-4 py-2 text-sm hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors"
          >
            View Get Started Guide
          </a>
        </div>
      </section>

      {/* Sign Out */}
      <button onClick={handleSignOut}
        className="text-sm text-[#ef4444] hover:text-[#f87171] transition-colors">
        Sign Out
      </button>
    </div>
  );
}
