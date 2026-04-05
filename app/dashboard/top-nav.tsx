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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e2535] bg-[#080a0f]/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
          CI
        </div>
        <span className="font-semibold text-[15px] text-[#e8edf8]">
          Contracts<span className="text-[#3b82f6]">Intel</span>
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <span className="text-sm text-[#8b9ab5] hidden md:block">{companyName}</span>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-8 h-8 bg-[#111520] border border-[#1e2535] flex items-center justify-center text-xs font-medium text-[#8b9ab5] hover:border-[#2a3548] transition-colors"
          >
            {initials}
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 border border-[#1e2535] bg-[#0d1018] shadow-xl z-50">
                <div className="px-4 py-3 border-b border-[#1e2535]">
                  <p className="text-sm text-[#e8edf8]">{userName ?? "User"}</p>
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
                  className="block w-full text-left px-4 py-2 text-sm text-[#ef4444] hover:bg-[#111520]"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
