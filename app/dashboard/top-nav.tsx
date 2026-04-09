"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

export function TopNav({
  companyName,
  userEmail,
  userName,
}: {
  companyName: string;
  userEmail: string;
  userName: string | null;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : userEmail[0]?.toUpperCase() ?? "U";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e2535] bg-[#0d1018]/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
            CI
          </div>
          <span className="font-semibold text-[15px] text-[#e8edf8]">
            Contracts<span className="text-[#3b82f6]">Intel</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Hamburger menu — mobile only */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-9 h-9 flex items-center justify-center text-[#8b9ab5] hover:bg-[#1e2535] transition-colors"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <span className="text-sm text-[#8b9ab5] hidden md:block" style={{ textTransform: "capitalize" }}>
            {companyName}
          </span>
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-8 h-8 bg-[#111520] border border-[#1e2535] flex items-center justify-center text-xs font-medium text-[#e8edf8] hover:border-[#2a3548] transition-colors"
            >
              {initials}
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 border border-[#1e2535] bg-[#0d1018] shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-[#1e2535]">
                    <p className="text-sm text-[#e8edf8]" style={{ textTransform: "capitalize" }}>
                      {userName ?? "User"}
                    </p>
                    <p className="text-xs text-[#4a5a75]">{userEmail}</p>
                  </div>
                  <Link
                    href="/dashboard/settings"
                    className="block px-4 py-2 text-sm text-[#8b9ab5] hover:bg-[#111520] hover:text-[#e8edf8]"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 text-left px-4 py-2 text-sm text-[#ef4444] hover:bg-[#111520] disabled:opacity-60"
                  >
                    {signingOut && (
                      <span className="w-3 h-3 border-2 border-[#ef4444] border-t-transparent rounded-full animate-spin" />
                    )}
                    {signingOut ? "Signing out..." : "Sign Out"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile navigation overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px]" />
          <div
            className="absolute left-0 top-0 bottom-0 w-[300px] bg-[#0d1018] border-r border-[#1e2535] shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "slideInLeft 0.2s ease" }}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#1e2535]">
              <span className="font-semibold text-[15px] text-[#e8edf8]">
                Contracts<span className="text-[#3b82f6]">Intel</span>
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-[#8b9ab5]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="py-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-5 py-3 text-[15px] font-medium text-[#8b9ab5] hover:bg-[#111520] hover:text-[#e8edf8] transition-colors"
                  style={{ minHeight: "48px", display: "flex", alignItems: "center" }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
