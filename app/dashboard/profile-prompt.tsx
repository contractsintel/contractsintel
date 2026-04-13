"use client";

import Link from "next/link";
import { useDashboard } from "./context";

/**
 * Reusable banner that nudges users to complete their org profile.
 * Shows when critical fields (NAICS, keywords, certs) are missing.
 *
 * Usage: <ProfilePrompt feature="matching" /> or <ProfilePrompt feature="analytics" />
 */
export function ProfilePrompt({
  feature,
  className = "",
}: {
  feature?: string;
  className?: string;
}) {
  const { organization } = useDashboard();

  const hasNaics = organization.naics_codes?.length > 0;
  const hasKeywords = organization.keywords?.length > 0;
  const hasCerts = organization.certifications?.length > 0;

  // If profile is reasonably complete, don't show anything
  if (hasNaics && hasKeywords) return null;

  const missing: string[] = [];
  if (!hasNaics) missing.push("NAICS codes");
  if (!hasKeywords) missing.push("keywords");
  if (!hasCerts) missing.push("certifications");

  const featureLabel = feature ? ` for ${feature}` : "";

  return (
    <div
      className={`border border-[#e0e7ff] bg-[#eef2ff] rounded-xl p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">💡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#3730a3]">
            Complete your profile{featureLabel}
          </p>
          <p className="text-xs text-[#6366f1] mt-1">
            Add your {missing.join(", ")} in Settings to get personalized
            results. The more info you provide, the better your matches.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-block mt-2 text-xs font-medium text-white bg-[#4f46e5] hover:bg-[#4338ca] px-3 py-1.5 rounded-lg transition-colors"
          >
            Go to Settings →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Friendly empty state for pages that fail due to missing tables or data.
 * Replaces raw "HTTP 500" or "Query failed" messages.
 */
export function FriendlyEmptyState({
  icon = "📋",
  title,
  description,
  action,
  actionHref,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="text-center py-16 px-4">
      <span className="text-4xl">{icon}</span>
      <h3 className="text-sm font-medium text-[#0f172a] mt-4">{title}</h3>
      <p className="text-xs text-[#64748b] mt-2 max-w-md mx-auto">
        {description}
      </p>
      {action && actionHref && (
        <Link
          href={actionHref}
          className="inline-block mt-4 text-xs font-medium text-white bg-[#3b82f6] hover:bg-[#2563eb] px-4 py-2 rounded-lg transition-colors"
        >
          {action}
        </Link>
      )}
    </div>
  );
}
