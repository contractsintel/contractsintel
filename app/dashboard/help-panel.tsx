"use client";

import { useState, useEffect } from "react";

export interface HelpContent {
  title: string;
  what: string;
  quickActions: string[];
  howItWorks: string;
  tips: string[];
}

const HELP_CONTENT: Record<string, HelpContent> = {
  dashboard: {
    title: "Dashboard",
    what: "This is your daily command center. Every morning, your best-matched government contract opportunities appear here, ranked by how well they fit your certifications and NAICS codes.",
    quickActions: [
      "Review opportunity scores",
      "Track or bid on opportunities",
      "Check urgent deadlines",
      "View your compliance status",
    ],
    howItWorks:
      "Every night, ContractsIntel scans 100+ government procurement sources — including SAM.gov, all 50 state procurement portals, military commands like DLA and Navy NECO, SBIR programs from 7 agencies, and subcontracting databases. Each new opportunity is scored against your certifications (like 8(a), SDVOSB, WOSB, or HUBZone), your NAICS codes, your location, and your preferred contract size. By 7am, your best matches are scored and ranked here with colored source badges showing where each opportunity came from.",
    tips: [
      "Focus on opportunities scoring 80 or higher — these are your strongest matches.",
      "Check the 'Urgent' count daily — these are closing within 7 days.",
      "Use the filters to narrow by certification type or agency.",
    ],
  },
  pipeline: {
    title: "Pipeline",
    what: "Your Pipeline tracks every opportunity you're pursuing, organized by stage — from initial interest through winning or losing the contract.",
    quickActions: [
      "Move opportunities between stages",
      "Mark a contract as Won",
      "Record why you lost a bid",
      "View your win rate",
    ],
    howItWorks:
      "When you click 'Track' or 'Mark as Bidding' on any opportunity, it appears here. Move it through the stages as your bid progresses. When you mark something as Won and enter the award amount, ContractsIntel automatically creates your delivery dashboard with milestones, starts your past performance record, and updates your agency win rate statistics.",
    tips: [
      "Always record why you lost — the data helps you spot patterns over time.",
      "Your win rate is calculated automatically and shown at the top. A healthy win rate for small contractors is 20-40%.",
    ],
  },
  proposals: {
    title: "Proposals",
    what: "This page generates AI-written first drafts of your proposal based on the solicitation requirements and your company profile.",
    quickActions: [
      "Generate a new draft",
      "Switch between Technical, Past Performance, and Executive Summary tabs",
      "Copy text to clipboard",
      "Download as a document",
      "Regenerate with specific guidance",
    ],
    howItWorks:
      "When you mark an opportunity as 'Bidding' in your Pipeline, it appears here. Click 'Generate Draft' and the AI reads the full solicitation, analyzes the requirements, and writes three proposal sections tailored to your company's certifications and experience. The draft is a starting point — review it, add your specific details, and polish it before submitting.",
    tips: [
      "Use the 'Guidance' field when regenerating to give the AI specific instructions, like 'Focus more on our cybersecurity experience' or 'Emphasize our past VA work.'",
      "The AI gets better at writing for your company over time as you build more past performance records.",
    ],
  },
  compliance: {
    title: "Compliance",
    what: "Your Compliance dashboard tracks every deadline and requirement that could affect your ability to bid on or keep government contracts.",
    quickActions: [
      "Check your health score",
      "View upcoming deadlines",
      "Review FAR regulation changes",
      "Update your CMMC status",
    ],
    howItWorks:
      "ContractsIntel automatically tracks your SAM.gov registration expiration, certification renewal dates, CMMC assessment deadlines, and changes to the Federal Acquisition Regulation (FAR) that affect your proposals. Your health score (0-100) tells you at a glance if anything needs attention. You get email alerts before deadlines — at 90, 60, 30, 14, 7, 3, and 1 day out.",
    tips: [
      "A score below 80 means something needs your attention soon.",
      "Red items are due within 30 days — act on these immediately.",
      "FAR changes can affect your proposal language — read the 'Action Required' notes carefully.",
    ],
  },
  "past-performance": {
    title: "Past Performance",
    what: "Your Performance Library stores records of every contract you've delivered, tracks monthly performance, and generates ready-to-use narratives for future proposals.",
    quickActions: [
      "Log this month's performance",
      "Generate PPQ narrative",
      "Search past performance by NAICS or agency",
      "Copy narrative text for a proposal",
    ],
    howItWorks:
      "When you win a contract, a performance record is created automatically. Each month, you get an email reminder to log what you delivered — deliverables completed, milestones met, issues resolved, and client feedback. This takes 5 minutes. When it's time to write a proposal, click 'Generate PPQ Narrative' and the AI creates formatted Past Performance Questionnaire text from your logged data — ready to paste directly into your proposal.",
    tips: [
      "Log your performance every month, even if it feels repetitive. The more data the AI has, the stronger your narratives will be.",
      "Past performance is one of the highest-weighted evaluation factors in federal proposals — a strong library gives you a real competitive advantage.",
    ],
  },
  contracts: {
    title: "Contracts",
    what: "Your delivery dashboard tracks everything happening with your active contracts — deadlines, reports, invoices, and option periods.",
    quickActions: [
      "View upcoming deadlines",
      "Add a custom milestone",
      "Submit an invoice",
      "Flag a late payment",
    ],
    howItWorks:
      "When you win a contract, milestones are auto-generated — monthly reports, quarterly reviews, and option period exercise dates for the full contract period. You can add your own custom milestones too. For invoices, enter the amount and submission date, and the system tracks the due date (30 days per the Prompt Payment Act). If the government is late paying, click 'Flag Late Payment' to generate a formal demand letter.",
    tips: [
      "Check this page weekly, not just when you get an alert.",
      "If a government payment is more than 15 days late, flag it — you're legally entitled to interest under the Prompt Payment Act.",
    ],
  },
  cpars: {
    title: "CPARS",
    what: "CPARS (Contractor Performance Assessment Reporting System) ratings are the government's report card on your work. This page tracks your ratings and helps you respond if a score is low.",
    quickActions: [
      "Enter a new rating",
      "View rating trends",
      "Generate a response to a low rating",
    ],
    howItWorks:
      "When you receive a CPARS evaluation from a contracting officer, enter it here. The system tracks your ratings over time by category: Quality, Schedule, Cost Control, Management, and Small Business Subcontracting. If any rating comes in below Satisfactory, the AI immediately generates a professional response addressing the concerns and citing evidence from your performance logs.",
    tips: [
      "Always respond to Marginal or Unsatisfactory ratings — a well-written response stays in the record and can offset the impact.",
      "Exceptional and Very Good ratings are your best marketing tools — reference them in proposals.",
    ],
  },
  network: {
    title: "Network",
    what: "The Subcontracting Network connects you with prime contractors looking for certified small businesses to join their teams on government bids.",
    quickActions: [
      "Browse teaming opportunities",
      "Express interest in a match",
      "Post your own teaming need (if you're a prime)",
    ],
    howItWorks:
      "Large prime contractors need certified small businesses (8(a), SDVOSB, WOSB, HUBZone) as subcontractors to meet their subcontracting goals. When a prime posts a teaming need, ContractsIntel matches it against your certifications and NAICS codes. If you're a match, you see the opportunity here and can express interest with one click. The prime sees your profile and past performance — no cold calls, no LinkedIn.",
    tips: [
      "Respond quickly — primes often select from the first 5-10 responses they receive.",
      "A strong past performance library makes you much more attractive as a teaming partner.",
    ],
  },
  competitors: {
    title: "Competitors",
    what: "Competitor Intelligence automatically builds profiles of the companies you compete against, tracking your win/loss record and identifying their patterns.",
    quickActions: [
      "View competitor profiles",
      "See win/loss history",
      "Read AI competitive analysis",
      "Add a competitor manually",
    ],
    howItWorks:
      "Every time you lose a bid and enter the winner's name, ContractsIntel creates or updates a competitor profile. Over time, you build a picture of each competitor — what agencies they win at, what NAICS codes they focus on, and whether they tend to win on price, technical approach, or past performance. The AI analyzes these patterns and suggests strategies for competing against them.",
    tips: [
      "The more bids you track (wins AND losses), the more useful this data becomes.",
      "Before writing a proposal, check if you've competed against the incumbent before — your competitor profile might reveal their weaknesses.",
    ],
  },
  settings: {
    title: "Settings",
    what: "Manage your company profile, notification preferences, subscription, and integrations.",
    quickActions: [
      "Refresh your SAM.gov profile",
      "Update notification preferences",
      "Connect Google Calendar",
      "Manage your subscription",
    ],
    howItWorks:
      "Your company profile drives everything — certifications, NAICS codes, and preferences determine which opportunities match. Keep your profile up to date for the best results. Connect Google Calendar to push all deadlines to your phone automatically.",
    tips: [
      "Update your NAICS codes whenever you add new capabilities.",
      "Connect Google Calendar early — it's the easiest way to never miss a deadline.",
    ],
  },
};

export function getHelpContent(page: string): HelpContent {
  return (
    HELP_CONTENT[page] ?? {
      title: "Help",
      what: "This page is part of your ContractsIntel dashboard.",
      quickActions: [],
      howItWorks: "",
      tips: [],
    }
  );
}

export function HelpPanel({
  page,
  open,
  onClose,
}: {
  page: string;
  open: boolean;
  onClose: () => void;
}) {
  const content = getHelpContent(page);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      // Small delay to trigger transition
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [open]);

  if (!open && !mounted) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[100] transition-opacity duration-200"
        style={{
          backgroundColor: mounted ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0)",
          pointerEvents: mounted ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 w-[400px] z-[101] bg-white border-l border-[#f0f1f3] overflow-y-auto transition-transform duration-200 ease-out shadow-[0_12px_40px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.04)]"
        style={{
          transform: mounted ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#f0f1f3]">
          <h2 className="text-sm font-medium text-[#111827]">
            {content.title} Help
          </h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#111827] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="square"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* What is this page? */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] mb-2">
              What is this page?
            </h3>
            <p className="text-sm text-[#4b5563] leading-relaxed">
              {content.what}
            </p>
          </div>

          {/* Quick actions */}
          {content.quickActions.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] mb-2">
                Quick actions
              </h3>
              <ul className="space-y-1.5">
                {content.quickActions.map((action, i) => (
                  <li
                    key={i}
                    className="text-sm text-[#4b5563] flex items-start gap-2"
                  >
                    <span className="text-[#2563eb] mt-0.5 shrink-0">
                      &bull;
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How it works */}
          {content.howItWorks && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] mb-2">
                How it works
              </h3>
              <p className="text-sm text-[#4b5563] leading-relaxed">
                {content.howItWorks}
              </p>
            </div>
          )}

          {/* Tips */}
          {content.tips.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] mb-2">
                Tips
              </h3>
              <ul className="space-y-2">
                {content.tips.map((tip, i) => (
                  <li
                    key={i}
                    className="text-sm text-[#4b5563] leading-relaxed flex items-start gap-2"
                  >
                    <span className="text-[#f59e0b] mt-0.5 shrink-0">
                      &#9733;
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Need help? */}
          <div className="border-t border-[#f0f1f3] pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] mb-2">
              Need help?
            </h3>
            <p className="text-sm text-[#4b5563]">
              Email us at{" "}
              <a
                href="mailto:support@contractsintel.com"
                className="text-[#3b82f6] hover:text-[#111827] transition-colors"
              >
                support@contractsintel.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export function HelpButton({
  page,
}: {
  page: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-8 h-8 border border-[#f0f1f3] bg-white flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:border-[#d1d5db] rounded-lg transition-all duration-200 ci-help-pulse"
        title="Help"
      >
        <span className="text-sm font-medium">?</span>
      </button>
      <HelpPanel page={page} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
