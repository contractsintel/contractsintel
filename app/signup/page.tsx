"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { seedDemoData } from "@/lib/demo-data";

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

    // B7: If the browser has a stale session from a previous user, the new
    // signup can "land" into the previous user's org because layout.tsx reads
    // the current auth cookie before the new user row is created. Sign out
    // first so the new user starts with a clean session.
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop — may already be signed out */
    }

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
      // Org record is auto-created by trigger — wait briefly then seed demo data
      // The trigger creates the org, so we need to find it
      await new Promise((r) => setTimeout(r, 1500)); // Wait for trigger
      const { data: userRec } = await supabase
        .from("users")
        .select("organization_id")
        .eq("auth_id", data.user.id)
        .single();

      if (userRec?.organization_id) {
        const orgId = userRec.organization_id;

        // Update org with name, UEI, and trial dates
        await supabase
          .from("organizations")
          .update({
            name: companyName || undefined,
            uei: uei || null,
            subscription_status: "trialing",
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("id", orgId);

        // Ensure user_preferences has get-started as default
        const { data: existingPrefs } = await supabase
          .from("user_preferences")
          .select("id")
          .eq("organization_id", orgId)
          .single();

        if (existingPrefs) {
          await supabase
            .from("user_preferences")
            .update({ default_page: "get-started", checklist_account_created: true })
            .eq("organization_id", orgId);
        } else {
          await supabase.from("user_preferences").insert({
            organization_id: orgId,
            default_page: "get-started",
            checklist_account_created: true,
          });
        }

        // Seed demo data so dashboard isn't empty
        await seedDemoData(supabase, orgId);
      }

      router.push("/dashboard/get-started");
    }
  };

  const handleGoogleSignup = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
              CI
            </div>
            <span className="font-semibold text-[15px] text-[#0f172a]">
              Contracts<span className="text-[#3b82f6]">Intel</span>
            </span>
          </Link>
        </div>

        <div className="border border-[#e5e7eb] bg-[#ffffff] p-8">
          <h1 className="ci-serif text-[30px] text-[#0f172a] mb-2">Start your free trial</h1>
          <p className="text-[#64748b] text-sm mb-6">
            Get AI-powered contract intelligence in minutes.
          </p>

          <button
            onClick={handleGoogleSignup}
            className="w-full border border-[#d1d5db] rounded-lg bg-[#f1f5f9] text-[#0f172a] py-3 px-4 text-sm font-medium hover:bg-[#f8f9fb] transition-colors mb-6 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e5e7eb]"></div></div>
            <div className="relative flex justify-center text-xs"><span className="bg-[#ffffff] px-3 text-[#94a3b8]">or sign up with email</span></div>
          </div>

          {/* Proof Strip */}
          <div className="flex items-center gap-4 mb-6 py-3 px-4 bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.3)] rounded-lg">
            <span className="text-xs text-[#059669]">&#10003; 14-day free trial</span>
            <span className="text-xs text-[#059669]">&#10003; No credit card</span>
            <span className="text-xs text-[#059669]">&#10003; SAM.gov verified</span>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5 font-mono uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-[#d1d5db] rounded-lg text-[#0f172a] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5 font-mono uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                className="w-full bg-white border border-[#d1d5db] rounded-lg text-[#0f172a] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5 font-mono uppercase tracking-wider">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-white border border-[#d1d5db] rounded-lg text-[#0f172a] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5 font-mono uppercase tracking-wider">
                UEI <span className="text-[#94a3b8]">(optional)</span>
              </label>
              <input
                type="text"
                value={uei}
                onChange={(e) => setUei(e.target.value)}
                placeholder="e.g. J7M9HPTGJ1S8"
                className="w-full bg-white border border-[#d1d5db] rounded-lg text-[#0f172a] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
              />
            </div>

            {error && <p className="text-[#ef4444] text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#2563eb] text-white py-3 text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Start Free Trial"}
            </button>
          </form>

          <p className="text-center text-sm text-[#64748b] mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-[#2563eb] hover:text-[#1d4ed8]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
