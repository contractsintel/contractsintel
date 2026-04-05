"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [uei, setUei] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: companyName,
          uei: uei || undefined,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Org record is auto-created by trigger, but update if needed
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
              CI
            </div>
            <span className="font-semibold text-[15px] text-[#e8edf8]">
              Contracts<span className="text-[#3b82f6]">Intel</span>
            </span>
          </Link>
        </div>

        <div className="border border-[#1e2535] bg-[#0d1018] p-8">
          <h1 className="text-2xl font-serif text-[#e8edf8] mb-2">Start your free trial</h1>
          <p className="text-[#8b9ab5] text-sm mb-6">
            Get AI-powered contract intelligence in minutes.
          </p>

          {/* Proof Strip */}
          <div className="flex items-center gap-4 mb-6 py-3 px-4 bg-[#111520] border border-[#1e2535]">
            <span className="text-xs text-[#22c55e]">&#10003; 14-day free trial</span>
            <span className="text-xs text-[#22c55e]">&#10003; No credit card required</span>
            <span className="text-xs text-[#22c55e]">&#10003; SAM.gov verified</span>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1.5 font-mono uppercase tracking-wider">
                UEI <span className="text-[#4a5a75]">(optional)</span>
              </label>
              <input
                type="text"
                value={uei}
                onChange={(e) => setUei(e.target.value)}
                placeholder="e.g. J7M9HPTGJ1S8"
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
              />
            </div>

            {error && <p className="text-[#ef4444] text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2563eb] text-white py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Start Free Trial"}
            </button>
          </form>

          <p className="text-center text-sm text-[#8b9ab5] mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-[#3b82f6] hover:text-[#e8edf8]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
