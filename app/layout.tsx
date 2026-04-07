import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContractsIntel — Find, Win, and Manage Government Contracts",
  description: "AI-powered government contract intelligence. Find, score, and win federal contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-['DM_Sans']">
        {children}
      </body>
    </html>
  );
}
