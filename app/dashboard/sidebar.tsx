"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDiscovery, tierLabel } from "@/lib/feature-gate";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "home", locked: false },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: "kanban", locked: false },
  { href: "/dashboard/proposals", label: "Proposals", icon: "document", locked: true },
  { href: "/dashboard/compliance", label: "Compliance", icon: "shield", locked: false },
  { href: "/dashboard/past-performance", label: "Past Performance", icon: "star", locked: true },
  { href: "/dashboard/contracts", label: "Contracts", icon: "briefcase", locked: true },
  { href: "/dashboard/settings", label: "Settings", icon: "gear", locked: false },
];

const ICONS: Record<string, JSX.Element> = {
  home: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M3 12l9-9 9 9M5 10v10h14V10" />
    </svg>
  ),
  kanban: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  document: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  shield: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  star: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  briefcase: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  ),
  gear: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="square" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="square" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export function Sidebar({ plan }: { plan: string }) {
  const pathname = usePathname();
  const locked = isDiscovery(plan);

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-[220px] border-r border-[#1e2535] bg-[#080a0f] flex flex-col z-40">
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const isLocked = item.locked && locked;

          return (
            <Link
              key={item.href}
              href={isLocked ? "#" : item.href}
              className={`group relative flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? "text-[#e8edf8] border-l-2 border-[#2563eb] bg-[#2563eb]/5"
                  : "text-[#8b9ab5] hover:text-[#e8edf8] hover:bg-[#0d1018] border-l-2 border-transparent"
              } ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={isLocked ? (e) => e.preventDefault() : undefined}
            >
              {ICONS[item.icon]}
              <span>{item.label}</span>
              {isLocked && (
                <>
                  <svg className="w-3 h-3 ml-auto text-[#4a5a75]" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-[#e8edf8] bg-[#111520] border border-[#1e2535] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Upgrade to BD Pro
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#1e2535]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-[#4a5a75]">
            {tierLabel(plan)}
          </span>
          {plan !== "team" && (
            <Link
              href="/dashboard/settings"
              className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
