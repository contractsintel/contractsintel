"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isDiscovery, isTeam, isTrialActive, tierLabel } from "@/lib/feature-gate";
import { useDashboard } from "./context";

/* ── Icon map ──────────────────────────────────────────────────────────── */

const ICONS: Record<string, JSX.Element> = {
  home: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M3 12l9-9 9 9M5 10v10h14V10" />
    </svg>
  ),
  search: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  rocket: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-6.233 0c-1.031 1.031-1.032 2.741 0 3.772l.003.003a4.493 4.493 0 003.772 0c1.031-1.031 2.741-1.032 3.772 0" />
    </svg>
  ),
  kanban: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  document: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  shield: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  briefcase: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  ),
  gear: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="square" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  star: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  cpars_star: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  handshake: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M7 11l3.5 3.5L21 4M3 11l3.5 3.5M14 4l3.5 3.5" />
    </svg>
  ),
  chart: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
};

/* ── Nav item type ─────────────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** locked behind BD Pro (trial unlocks) */
  bdProLocked: boolean;
  /** locked behind Team tier (trial unlocks) */
  teamOnly: boolean;
  tourId: string;
  color: string;
  lightBg: string;
}

/* ── Top-level nav items (always visible) ──────────────────────────────── */

const TOP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", bdProLocked: false, teamOnly: false, tourId: "", color: "#2563eb", lightBg: "#eff4ff" },
  { href: "/dashboard/get-started", label: "Get Started", icon: "rocket", bdProLocked: false, teamOnly: false, tourId: "", color: "#2563eb", lightBg: "#eff4ff" },
  { href: "/dashboard/search", label: "Search Contracts", icon: "search", bdProLocked: false, teamOnly: false, tourId: "", color: "#059669", lightBg: "#ecfdf5" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: "kanban", bdProLocked: false, teamOnly: false, tourId: "sidebar-pipeline", color: "#d97706", lightBg: "#fffbeb" },
  { href: "/dashboard/proposals", label: "Proposals", icon: "document", bdProLocked: true, teamOnly: false, tourId: "sidebar-proposals", color: "#7c3aed", lightBg: "#f5f3ff" },
  { href: "/dashboard/compliance", label: "Compliance", icon: "shield", bdProLocked: false, teamOnly: false, tourId: "sidebar-compliance", color: "#059669", lightBg: "#ecfdf5" },
  { href: "/dashboard/contracts", label: "Contracts", icon: "briefcase", bdProLocked: true, teamOnly: false, tourId: "sidebar-contracts", color: "#0891b2", lightBg: "#ecfeff" },
  { href: "/dashboard/past-performance", label: "Past Performance", icon: "star", bdProLocked: true, teamOnly: false, tourId: "sidebar-past-performance", color: "#dc2626", lightBg: "#fef2f2" },
  { href: "/dashboard/cpars", label: "CPARS", icon: "cpars_star", bdProLocked: false, teamOnly: true, tourId: "", color: "#e11d48", lightBg: "#fff1f2" },
  { href: "/dashboard/network", label: "Network", icon: "handshake", bdProLocked: false, teamOnly: true, tourId: "", color: "#2563eb", lightBg: "#eff4ff" },
  { href: "/dashboard/competitors", label: "Competitors", icon: "search", bdProLocked: false, teamOnly: true, tourId: "", color: "#7c3aed", lightBg: "#f5f3ff" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "chart", bdProLocked: false, teamOnly: true, tourId: "", color: "#d97706", lightBg: "#fffbeb" },
  { href: "/dashboard/settings", label: "Settings", icon: "gear", bdProLocked: false, teamOnly: false, tourId: "sidebar-settings", color: "#6b7280", lightBg: "#f1f5f9" },
];

/* ── "More Products" — now merged into TOP_NAV ──────────────────────────── */
const MORE_NAV: NavItem[] = [];

/* ── Setup progress ring ───────────────────────────────────────────────── */

function SetupProgressRing({ completed, total }: { completed: number; total: number }) {
  const size = 44;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? completed / total : 0;
  const dashOffset = circumference * (1 - pct);
  const pctText = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link
      href="/dashboard/get-started"
      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#f0f1f3] transition-colors rounded-lg mx-2"
    >
      <div className="relative shrink-0" style={{ width: size, height: size, filter: "drop-shadow(0 0 6px rgba(37,99,235,0.2))" }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-['JetBrains_Mono'] text-[#0f172a]">{pctText}%</span>
      </div>
      <span className="text-xs text-[#4b5563] font-medium">Setup: {completed}/{total}</span>
    </Link>
  );
}

/* ── Nav link renderer ─────────────────────────────────────────────────── */

function SidebarLink({
  item,
  isActive,
  isLocked,
  indented,
}: {
  item: NavItem;
  isActive: boolean;
  isLocked: boolean;
  indented?: boolean;
}) {
  return (
    <Link
      href={isLocked ? "#" : item.href}
      data-tour={item.tourId || undefined}
      className={`group relative flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-[14px] font-medium transition-all duration-150 ${
        isActive
          ? "text-[#2563eb] font-semibold bg-[#eff6ff]"
          : "text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6]"
      } ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
      onClick={isLocked ? (e) => e.preventDefault() : undefined}
    >
      <span className={`${isActive ? "text-[#2563eb]" : "text-[#9ca3af] group-hover:text-[#4b5563]"} transition-colors`}>
        {ICONS[item.icon]}
      </span>
      <span>{item.label}</span>
      {isLocked && (
        <>
          <svg className="w-3 h-3 ml-auto text-[#9ca3af]" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="absolute left-full ml-2 px-2 py-1 text-xs text-[#111827] bg-[#f8f9fb] border border-[#e5e7eb] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {item.teamOnly ? "Upgrade to Team" : "Upgrade to BD Pro"}
          </span>
        </>
      )}
    </Link>
  );
}

/* ── Sidebar ───────────────────────────────────────────────────────────── */

export function Sidebar({ plan }: { plan: string }) {
  const pathname = usePathname();
  const { organization } = useDashboard();
  const trial = isTrialActive(organization);
  const locked = trial ? false : isDiscovery(plan);
  const teamTier = trial ? true : isTeam(plan);

  const [moreOpen, setMoreOpen] = useState(false);

  // Hydrate expand state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ci_sidebar_more");
      if (stored === "true") setMoreOpen(true);
    } catch {
      // SSR / restricted storage
    }
  }, []);

  const toggleMore = () => {
    const next = !moreOpen;
    setMoreOpen(next);
    try {
      localStorage.setItem("ci_sidebar_more", String(next));
    } catch {
      // ignore
    }
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const isItemLocked = (item: NavItem) =>
    (item.bdProLocked && locked) || (item.teamOnly && !teamTier);

  // Hardcoded setup progress (2 of 7)
  const setupCompleted = 2;
  const setupTotal = 7;

  const onboardingIncomplete = organization.onboarding_complete === false;

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-[240px] ci-sidebar-bg flex flex-col z-40">
      {/* Top nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Onboarding link — shown only when onboarding is incomplete */}
        {onboardingIncomplete && (
          <Link href="/dashboard/onboarding"
            className={`group relative flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-[14px] font-medium transition-all ${
              pathname.startsWith("/dashboard/onboarding")
                ? "text-[#2563eb] font-semibold bg-[#eff6ff]"
                : "text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6]"
            }`}>
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            Onboarding
          </Link>
        )}

        {/* Regular nav items — grayed out during onboarding */}
        <div className={onboardingIncomplete ? "opacity-40 pointer-events-none" : ""}>
        {TOP_NAV.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            isActive={isActive(item.href)}
            isLocked={isItemLocked(item)}
          />
        ))}

        {/* "More Products" divider + toggle */}
        <div className="border-t border-[#f0f1f3] mx-4 my-2" />
        <button
          onClick={toggleMore}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af] hover:text-[#4b5563] transition-colors"
        >
          <span className="flex items-center gap-2">
            <span
              className="inline-block transition-transform duration-200"
              style={{ transform: moreOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              &#9656;
            </span>
            More Products
          </span>
          <span className="text-[10px] bg-[#f1f5f9] text-[#6b7280] px-1.5 py-0.5 rounded-full">
            {MORE_NAV.length}
          </span>
        </button>

        {/* Expandable section */}
        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
          style={{ maxHeight: moreOpen ? "500px" : "0px" }}
        >
          {MORE_NAV.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              isLocked={isItemLocked(item)}
              indented
            />
          ))}
        </div>
        </div> {/* end onboarding gray wrapper */}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-[#f0f1f3]">
        {/* Setup progress ring */}
        <SetupProgressRing completed={setupCompleted} total={setupTotal} />

        {/* Tier badge & upgrade */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#eff6ff] text-[#2563eb]">
            {trial ? "Free Trial" : tierLabel(plan)}
          </span>
          {!trial && plan !== "team" && (
            <Link
              href="/dashboard/settings"
              className="text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
