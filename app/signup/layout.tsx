import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create Account — ContractsIntel",
  description: "Start your free trial of ContractsIntel. AI-powered government contract intelligence for certified contractors.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
