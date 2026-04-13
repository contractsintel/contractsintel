import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — ContractsIntel",
  description: "Sign in to your ContractsIntel account to manage government contract opportunities.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
