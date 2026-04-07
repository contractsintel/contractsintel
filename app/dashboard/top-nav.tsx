"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#e5e7eb] bg-white/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
          CI
        </div>
        <span className="font-semibold text-[15px] text-[#111827]">
          Contracts<span className="text-[#3b82f6]">Intel</span>
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {/* Hamburger menu — mobile only */}
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-md text-[#4b5563] hover:bg-[#f3f4f6] transition-colors">
          {mobileMenuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
          )}
        </button>
        <span className="text-sm text-[#4b5563] hidden md:block" style={{textTransform:"capitalize"}}>{companyName}</span>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-8 h-8 bg-[#f8f9fb] border border-[#e5e7eb] flex items-center justify-center text-xs font-medium text-[#4b5563] hover:border-[#d1d5db] transition-colors"
          >
            {initials}
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 border border-[#e5e7eb] bg-white shadow-xl z-50">
                <div className="px-4 py-3 border-b border-[#e5e7eb]">
                  <p className="text-sm text-[#111827]" style={{textTransform:"capitalize"}}>{userName ?? "User"}</p>
                  <p className="text-xs text-[#9ca3af]">{userEmail}</p>
                </div>
                <Link
                  href="/dashboard/settings"
                  className="block px-4 py-2 text-sm text-[#4b5563] hover:bg-[#f8f9fb] hover:text-[#111827]"
                  onClick={() => setDropdownOpen(false)}
                >
                  Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-4 py-2 text-sm text-[#ef4444] hover:bg-[#f8f9fb]"
                >
                  Sign Out
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[4px]" />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-white shadow-2xl overflow-y-auto"
               onClick={(e) => e.stopPropagation()}
               style={{animation: "slideInLeft 0.2s ease"}}>
            <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
              <span className="font-semibold text-[15px] text-[#111827]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
              <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center text-[#6b7280]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <nav className="py-2">
              {[
                { href: "/dashboard", label: "Dashboard" },
                { href: "/dashboard/get-started", label: "Get Started" },
                { href: "/dashboard/search", label: "Search Contracts" },
                { href: "/dashboard/pipeline", label: "Pipeline" },
                { href: "/dashboard/proposals", label: "Proposals" },
                { href: "/dashboard/compliance", label: "Compliance" },
                { href: "/dashboard/contracts", label: "Contracts" },
                { href: "/dashboard/settings", label: "Settings" },
              ].map((item) => (
                <Link key={item.href} href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-5 py-3 text-[15px] font-medium text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#111827] transition-colors"
                  style={{minHeight: "48px", display: "flex", alignItems: "center"}}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-[#e5e7eb] p-4">
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#eff6ff] text-[#2563eb]">Free Trial</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
