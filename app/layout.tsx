import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "./cookie-consent";

export const metadata: Metadata = {
  title: "ContractsIntel — Find, Win, and Manage Government Contracts",
  description: "AI-powered government contract intelligence. Find, score, and win federal contracts.",
  openGraph: {
    title: "ContractsIntel — Find, Win, and Manage Government Contracts",
    description: "The operating system for certified government contractors. 22 integrated products. One subscription.",
    url: "https://contractsintel.com",
    siteName: "ContractsIntel",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ContractsIntel — Government Contract Intelligence",
    description: "AI-powered government contract intelligence. Find, score, and win federal contracts.",
  },
  metadataBase: new URL("https://contractsintel.com"),
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
        <CookieConsent />
      </body>
    </html>
  );
}
