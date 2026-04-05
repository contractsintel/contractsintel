"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

const CERTIFICATIONS = ["8(a)", "HUBZone", "WOSB", "EDWOSB", "SDVOSB", "Small Business"];

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [certs, setCerts] = useState<string[]>([]);
  const [naicsCodes, setNaicsCodes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data) {
        setProfile(data);
        setFullName(data.full_name || "");
        setCompanyName(data.company_name || "");
        setCerts(data.certifications || []);
        setNaicsCodes((data.naics_codes || []).join(", "));
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").update({
      full_name: fullName,
      company_name: companyName,
      certifications: certs,
      naics_codes: naicsCodes.split(",").map((s) => s.trim()).filter(Boolean),
    }).eq("id", user.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const toggleCert = (c: string) => setCerts((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  if (!profile) return <div className="min-h-screen bg-[#080a0f] flex items-center justify-center text-[#8b9ab5]">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#080a0f]">
      <nav className="border-b border-[#1e2535] bg-[#080a0f]/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
          <span className="font-semibold text-[15px] text-[#e8edf8]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
        </Link>
        <Link href="/dashboard" className="text-sm text-[#8b9ab5] hover:text-[#e8edf8]">← Back to Dashboard</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-[#e8edf8] mb-8">Settings</h1>

        <div className="border border-[#1e2535] bg-[#0d1018] p-6 space-y-5 mb-6">
          <h2 className="text-xs text-[#4a5a75] font-mono uppercase tracking-wider">Profile</h2>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5">Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5">Company Name</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-2">Certifications</label>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATIONS.map((c) => (
                <button key={c} type="button" onClick={() => toggleCert(c)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${certs.includes(c) ? "border-[#2563eb] bg-[#2563eb]/10 text-[#3b82f6]" : "border-[#1e2535] text-[#8b9ab5]"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1.5">NAICS Codes (comma-separated)</label>
            <input type="text" value={naicsCodes} onChange={(e) => setNaicsCodes(e.target.value)}
              placeholder="541511, 541512, 541330"
              className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="bg-[#2563eb] text-white px-6 py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50">
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
          </button>
        </div>

        <div className="border border-[#1e2535] bg-[#0d1018] p-6 mb-6">
          <h2 className="text-xs text-[#4a5a75] font-mono uppercase tracking-wider mb-3">Subscription</h2>
          <p className="text-sm text-[#e8edf8] mb-1">Current plan: <span className="text-[#3b82f6] font-medium capitalize">{profile.plan}</span></p>
          {profile.plan === "trial" && (
            <a href="https://buy.stripe.com/6oUdR95EN3467WHaGS5wI03" target="_blank"
              className="inline-block mt-3 bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6]">
              Upgrade to BD Pro
            </a>
          )}
        </div>

        <button onClick={handleSignOut}
          className="text-sm text-[#ef4444] hover:text-[#f87171] transition-colors">
          Sign Out
        </button>
      </main>
    </div>
  );
}
