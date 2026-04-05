"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

const CERTIFICATIONS = ["8(a)", "HUBZone", "WOSB", "EDWOSB", "SDVOSB", "Small Business"];
const NAICS_COMMON = [
  "541511 — Custom Software Development",
  "541512 — Computer Systems Design",
  "541519 — Other IT Services",
  "541330 — Engineering Services",
  "541611 — Management Consulting",
  "541613 — Marketing Consulting",
  "561210 — Facilities Support",
  "561612 — Security Guards",
  "236220 — Commercial Construction",
  "238210 — Electrical Contractors",
];

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [certs, setCerts] = useState<string[]>([]);
  const [naics, setNaics] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const toggleCert = (c: string) => setCerts((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const toggleNaics = (n: string) => setNaics((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").update({
        full_name: fullName,
        company_name: companyName,
        certifications: certs,
        naics_codes: naics.map((n) => n.split(" — ")[0]),
      }).eq("id", data.user.id);
    }

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
            <span className="font-semibold text-[15px] text-[#e8edf8]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
          </Link>
        </div>

        <div className="border border-[#1e2535] bg-[#0d1018] p-8">
          <h1 className="text-2xl font-semibold text-[#e8edf8] mb-2">Start your free trial</h1>
          <p className="text-[#8b9ab5] text-sm mb-6">14 days free. No credit card required to explore.</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" required />
              </div>
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">Company</label>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" required />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" required />
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" required />
            </div>

            <div>
              <label className="block text-xs text-[#8b9ab5] mb-2 font-mono uppercase tracking-wider">Certifications</label>
              <div className="flex flex-wrap gap-2">
                {CERTIFICATIONS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleCert(c)}
                    className={`px-3 py-1.5 text-xs border transition-colors ${certs.includes(c) ? "border-[#2563eb] bg-[#2563eb]/10 text-[#3b82f6]" : "border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548]"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#8b9ab5] mb-2 font-mono uppercase tracking-wider">NAICS Codes</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto border border-[#1e2535] p-3 bg-[#111520]">
                {NAICS_COMMON.map((n) => (
                  <label key={n} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={naics.includes(n)} onChange={() => toggleNaics(n)}
                      className="accent-[#2563eb]" />
                    <span className={`text-xs ${naics.includes(n) ? "text-[#e8edf8]" : "text-[#8b9ab5]"}`}>{n}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-[#ef4444] text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-[#2563eb] text-white py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50">
              {loading ? "Creating account..." : "Start Free Trial"}
            </button>
          </form>

          <p className="text-center text-sm text-[#8b9ab5] mt-6">
            Already have an account? <Link href="/login" className="text-[#3b82f6] hover:text-[#e8edf8]">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
