// Shared nav item definitions consumed by both Sidebar (full layout)
// and TopNav mobile drawer. Single source of truth for label/href/order.
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  bdProLocked: boolean;
  teamOnly: boolean;
  tourId: string;
  color: string;
  lightBg: string;
}

export const NAV_ITEMS: NavItem[] = [
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
