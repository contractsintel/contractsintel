"use client";

import { createContext, useContext } from "react";
import type { Organization, UserProfile } from "@/lib/types";

interface DashboardContextType {
  user: UserProfile;
  organization: Organization;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({
  user,
  organization,
  children,
}: {
  user: UserProfile;
  organization: Organization;
  children: React.ReactNode;
}) {
  return (
    <DashboardContext.Provider value={{ user, organization }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
