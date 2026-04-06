"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isTrialActive } from "@/lib/feature-gate";
import { HelpButton } from "../help-panel";
import { ProductTour } from "../tour";

// ─── Screenshot Mockup Components ───────────────────────────────────────

function MockDigestEmail() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Sample digest email
      </div>
      <div className="border border-[#1e2535] bg-[#111520] p-4 space-y-2">
        <div className="text-xs text-[#2563eb] font-medium">
          ContractsIntel Daily Digest — 7 New Matches
        </div>
        <div className="h-px bg-[#1e2535]" />
        {[
          { score: 94, title: "IT Support Services — Fort Belvoir", val: "$847K" },
          { score: 91, title: "Healthcare IT Modernization", val: "$2.1M" },
          { score: 85, title: "Program Support Services", val: "$320K" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <span className="text-xs font-mono text-[#22c55e] w-8">{item.score}</span>
            <span className="text-xs text-[#8b9ab5] flex-1 truncate">{item.title}</span>
            <span className="text-xs font-mono text-[#e8edf8]">{item.val}</span>
          </div>
        ))}
        <div className="text-[10px] text-[#4a5a75] pt-1">+ 4 more matches</div>
      </div>
    </div>
  );
}

function MockOpportunityCard() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Opportunity card with recommendation
      </div>
      <div className="border border-[#1e2535] bg-[#111520] p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl font-bold font-mono text-[#22c55e]">94</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-[#e8edf8]">IT Support Services — Fort Belvoir, VA</span>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 uppercase">
                bid
              </span>
            </div>
            <div className="text-xs text-[#8b9ab5] mb-2">Department of Defense | DEMO-2026-0001</div>
            <p className="text-xs text-[#4a5a75]">
              Your SDVOSB certification is a direct match for this set-aside, and your NAICS 541512 experience aligns perfectly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockActionButtons() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Action buttons highlighted
      </div>
      <div className="flex items-center gap-2 bg-[#111520] border border-[#1e2535] p-4">
        <div className="px-3 py-1.5 text-xs border border-[#2563eb] text-[#2563eb] bg-[#2563eb]/5">Track</div>
        <div className="px-3 py-1.5 text-xs bg-[#2563eb] text-white">Bid</div>
        <div className="px-3 py-1.5 text-xs text-[#4a5a75]">Skip</div>
        <div className="px-3 py-1.5 text-xs text-[#3b82f6]">SAM.gov</div>
      </div>
    </div>
  );
}

function MockFilterBar() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Filter bar
      </div>
      <div className="flex items-center gap-2 bg-[#111520] border border-[#1e2535] p-3">
        <div className="px-2 py-1 text-[10px] border border-[#1e2535] text-[#8b9ab5] bg-[#0d1018]">
          All Set-Asides &#x25BC;
        </div>
        <div className="px-2 py-1 text-[10px] border border-[#1e2535] text-[#8b9ab5] bg-[#0d1018]">
          Filter agency...
        </div>
        <div className="px-2 py-1 text-[10px] border border-[#1e2535] text-[#8b9ab5] bg-[#0d1018]">
          Min Score: Any &#x25BC;
        </div>
        <div className="px-2 py-1 text-[10px] border border-[#1e2535] text-[#8b9ab5] bg-[#0d1018]">
          Sort: Score &#x25BC;
        </div>
      </div>
    </div>
  );
}

function MockPipeline() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Pipeline page with cards in stages
      </div>
      <div className="flex gap-2">
        {[
          { label: "Monitoring", count: 3, items: ["IT Support", "Facilities Mgmt", "Logistics"] },
          { label: "Preparing Bid", count: 1, items: ["Cybersecurity"] },
          { label: "Submitted", count: 0, items: [] },
          { label: "Won", count: 0, items: [] },
        ].map((col) => (
          <div key={col.label} className="flex-1 bg-[#111520] border border-[#1e2535] p-2">
            <div className="text-[9px] font-mono text-[#4a5a75] uppercase mb-2">
              {col.label} ({col.count})
            </div>
            {col.items.map((item, i) => (
              <div key={i} className="bg-[#0d1018] border border-[#1e2535] p-1.5 mb-1 text-[9px] text-[#8b9ab5] truncate">
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockComplianceDashboard() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Compliance dashboard with health score
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        <div className="flex items-center gap-4 mb-3">
          <span className="text-2xl font-bold font-mono text-[#22c55e]">87</span>
          <div className="flex-1">
            <div className="w-full h-2 bg-[#1e2535]">
              <div className="h-full bg-[#22c55e]" style={{ width: "87%" }} />
            </div>
          </div>
        </div>
        {[
          { label: "SAM.gov Registration", status: "Active", color: "text-[#22c55e]" },
          { label: "8(a) Certification", due: "90 days", color: "text-[#22c55e]" },
          { label: "CMMC Level 2", status: "In Progress", color: "text-[#f59e0b]" },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1 text-[10px]">
            <span className="text-[#8b9ab5]">{item.label}</span>
            <span className={`font-mono ${item.color}`}>{item.status ?? `${item.due} left`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCalendarSync() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Google Calendar with synced deadlines
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4 space-y-1.5">
        {[
          { date: "Apr 9", title: "Bid Due: Program Support Services", color: "border-l-[#ef4444]" },
          { date: "Apr 13", title: "Bid Due: IT Support Services", color: "border-l-[#f59e0b]" },
          { date: "Apr 15", title: "SAM.gov Registration Renewal", color: "border-l-[#2563eb]" },
        ].map((item, i) => (
          <div key={i} className={`flex items-center gap-3 border-l-2 ${item.color} pl-2 py-1`}>
            <span className="text-[10px] font-mono text-[#4a5a75] w-10">{item.date}</span>
            <span className="text-[10px] text-[#8b9ab5]">{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockProposalDraft() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Proposal draft with tabs
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        <div className="flex gap-1 mb-3">
          <div className="px-2 py-1 text-[9px] bg-[#2563eb] text-white">Technical Approach</div>
          <div className="px-2 py-1 text-[9px] border border-[#1e2535] text-[#4a5a75]">Past Performance</div>
          <div className="px-2 py-1 text-[9px] border border-[#1e2535] text-[#4a5a75]">Executive Summary</div>
        </div>
        <div className="space-y-1">
          <div className="h-2 bg-[#1e2535] w-full" />
          <div className="h-2 bg-[#1e2535] w-[90%]" />
          <div className="h-2 bg-[#1e2535] w-[95%]" />
          <div className="h-2 bg-[#1e2535] w-[70%]" />
        </div>
      </div>
    </div>
  );
}

function MockPastPerformance() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Past performance record with monthly logs
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        <div className="text-xs text-[#e8edf8] mb-2">VA IT Support Contract</div>
        <div className="text-[10px] text-[#4a5a75] mb-3">DEMO-VA-2025-001 | $320,000</div>
        {["Jan 2026", "Feb 2026", "Mar 2026"].map((month, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-[#1e2535] last:border-0">
            <span className="text-[10px] text-[#8b9ab5]">{month}</span>
            <span className="text-[10px] text-[#22c55e] font-mono">Logged</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockContractDashboard() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Contract delivery dashboard with milestones
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        {[
          { title: "Kick-off Meeting", status: "Completed", color: "text-[#22c55e]" },
          { title: "Q1 Performance Report", status: "Completed", color: "text-[#22c55e]" },
          { title: "Q2 Performance Report", status: "Overdue", color: "text-[#ef4444]" },
          { title: "Mid-Year Review", status: "14 days", color: "text-[#f59e0b]" },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 text-[10px]">
            <span className="text-[#8b9ab5]">{item.title}</span>
            <span className={`font-mono ${item.color}`}>{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCpars() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: CPARS rating trends
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        {["Quality", "Schedule", "Cost Control", "Management"].map((cat, i) => (
          <div key={i} className="flex items-center justify-between py-1 text-[10px]">
            <span className="text-[#8b9ab5]">{cat}</span>
            <span className="font-mono text-[#22c55e]">
              {["Exceptional", "Very Good", "Satisfactory", "Very Good"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockNetwork() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Teaming opportunity matches
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4 space-y-2">
        {[
          { prime: "Lockheed Martin", need: "SDVOSB Subcontractor", naics: "541512" },
          { prime: "Raytheon", need: "8(a) IT Support", naics: "541511" },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[10px]">
            <div>
              <span className="text-[#e8edf8]">{item.prime}</span>
              <span className="text-[#4a5a75] mx-2">|</span>
              <span className="text-[#8b9ab5]">{item.need}</span>
            </div>
            <span className="font-mono text-[#4a5a75]">{item.naics}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCompetitors() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Competitor profile with win/loss history
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        <div className="text-xs text-[#e8edf8] mb-2">Apex Systems Inc.</div>
        <div className="flex gap-4 text-[10px] mb-2">
          <span className="text-[#22c55e]">2 Wins vs them</span>
          <span className="text-[#ef4444]">1 Loss to them</span>
        </div>
        <div className="text-[10px] text-[#4a5a75]">
          Primary agencies: DoD, VA | Focus: IT services, cybersecurity
        </div>
      </div>
    </div>
  );
}

function MockVehicleAlerts() {
  return (
    <div className="border border-[#1e2535] bg-[#0d1018] p-4 my-4">
      <div className="text-[10px] font-mono text-[#4a5a75] mb-3 uppercase tracking-wider">
        Screenshot: Contract vehicle alert
      </div>
      <div className="bg-[#111520] border border-[#1e2535] p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 font-mono uppercase">
            On-Ramp Open
          </span>
          <span className="text-xs text-[#e8edf8]">GSA Schedule 70</span>
        </div>
        <div className="text-[10px] text-[#8b9ab5]">
          Application deadline: 45 days | Your NAICS codes qualify
        </div>
      </div>
    </div>
  );
}

// ─── Product Guide Sections ──────────────────────────────────────────────

interface GuideSection {
  num: string;
  id: string;
  title: string;
  maxGuideIndex: number; // Discovery: 5, BD Pro: 11, Team: 16
  whatItDoes: string;
  whyItMatters: string;
  howToUseIt: string[];
  tips: string;
}

const ALL_GUIDES: GuideSection[] = [
  {
    num: "01",
    id: "daily-digest",
    title: "Daily Digest & Opportunity Matching",
    maxGuideIndex: 5,
    whatItDoes:
      "Every night, ContractsIntel scans government procurement websites for new contract opportunities. It checks each one against your certifications (like 8(a), SDVOSB, WOSB, or HUBZone) and your NAICS codes. By 7am, a ranked list of your best matches lands in your email inbox with scores and recommendations.",
    whyItMatters:
      "Most small contractors check SAM.gov manually every few days. Studies show this means you miss 68% of eligible opportunities. A single missed contract could be worth $150,000 to $2,000,000. This product makes sure you never miss one again.",
    howToUseIt: [
      "Check your email every morning -- your digest arrives at 7am with your top 10 matches.",
      "Review the match scores -- higher means a better fit for your business.",
      "Read the AI recommendation -- BID (green) means go for it, MONITOR (yellow) means watch it, SKIP (gray) means don't waste time.",
      "Click Track to save an opportunity to your Pipeline.",
      "Click Mark as Bidding when you decide to pursue it.",
      "Use the filters on the Dashboard to narrow by certification, agency, or deadline.",
    ],
    tips: "Focus on opportunities scoring 80 or higher. Check the Urgent count daily -- those close within 7 days. The AI also identifies who currently holds the contract so you know your competition.",
  },
  {
    num: "02",
    id: "pipeline-tracker",
    title: "Pipeline Tracker",
    maxGuideIndex: 5,
    whatItDoes:
      "Your Pipeline organizes every opportunity you're pursuing into stages: Monitoring, Preparing Bid, Submitted, Won, and Lost. It gives you a clear view of your entire business development pipeline with total values and win rates.",
    whyItMatters:
      "Without a pipeline, you lose track of what you're bidding on and what's due when. Most small contractors manage this in spreadsheets and miss deadlines. The Pipeline keeps everything organized and automatically creates records when you win.",
    howToUseIt: [
      "Track opportunities from your Dashboard -- they appear in the Monitoring column.",
      "Move cards to Preparing Bid when you start working on a proposal.",
      "Move to Submitted after you send your proposal.",
      "When you win, enter the award amount -- your delivery dashboard and past performance record are created automatically.",
      "When you lose, enter the reason -- this data helps you improve over time.",
    ],
    tips: "Your win rate is shown at the top. A healthy win rate for small contractors is 20-40%. Always record why you lost -- patterns emerge over time.",
  },
  {
    num: "03",
    id: "compliance-monitor",
    title: "Compliance Monitor",
    maxGuideIndex: 5,
    whatItDoes:
      "Tracks every compliance deadline that could affect your ability to bid on or keep government contracts. It monitors your SAM.gov registration, certification renewals, CMMC requirements, and changes to federal acquisition regulations (FAR). Your health score (0-100) shows your overall compliance status at a glance.",
    whyItMatters:
      "One lapsed SAM.gov registration means you can't get paid on an active contract. One missed certification renewal means you can't bid on set-aside contracts. One FAR change you didn't catch means your proposal language is wrong. ContractsIntel watches all of this so you don't have to.",
    howToUseIt: [
      "Check your health score weekly -- anything below 80 needs attention.",
      "Red items are due within 30 days -- act on these immediately.",
      "Orange items are due within 90 days -- start planning.",
      "Review FAR change alerts -- they tell you what changed and what to update in your proposals.",
      "Check your CMMC status if you work with the Department of Defense.",
    ],
    tips: "A score below 80 means something needs your attention soon. Set up Google Calendar sync so deadline reminders appear on your phone.",
  },
  {
    num: "04",
    id: "google-calendar-sync",
    title: "Google Calendar Sync",
    maxGuideIndex: 5,
    whatItDoes:
      "Pushes deadlines from inside ContractsIntel to your Google Calendar. When you track opportunities, win contracts, or have compliance deadlines, they automatically show up on your phone and desktop with reminders at 14, 7, 3, and 1 day out.",
    whyItMatters:
      "Email alerts are awareness -- you read them and might forget. Calendar events with popup reminders on your phone mean nothing slips. This is the safety net that catches everything.",
    howToUseIt: [
      "Go to Settings and click Connect Google Calendar.",
      "Sign in with your Google account and click Allow.",
      "Choose what to sync: opportunity deadlines, contract milestones, compliance dates.",
      "Deadlines start appearing on your calendar immediately.",
    ],
    tips: "Use your primary work calendar so reminders show up alongside your other meetings. You can disconnect anytime from Settings.",
  },
  {
    num: "05",
    id: "sam-profile-audit",
    title: "SAM.gov Profile Audit",
    maxGuideIndex: 5,
    whatItDoes:
      "Analyzes your SAM.gov registration and scores it from 0-100. Checks your registration status, NAICS codes, certifications, CAGE code, contact info, and entity description. Gives you specific recommendations on what to fix.",
    whyItMatters:
      "An incomplete SAM.gov profile means contracting officers can't find you when searching for contractors. Missing NAICS codes mean you won't match to opportunities you're qualified for. A weak profile costs you contracts you never even see.",
    howToUseIt: [
      "Go to the Audit page (accessible from the homepage too).",
      "Enter your 12-character UEI number.",
      "Review your score and category breakdown.",
      "Follow the recommendations to improve your profile.",
      "Re-run the audit after making changes to see your new score.",
    ],
    tips: "Most contractors score between 60-75. A score above 85 puts you in the top 20% of SAM.gov profiles.",
  },
  {
    num: "06",
    id: "ai-proposal-drafts",
    title: "AI Proposal First Drafts",
    maxGuideIndex: 11,
    whatItDoes:
      "When you mark an opportunity as Bidding, the AI reads the solicitation requirements and writes three proposal sections: Technical Approach, Past Performance narrative, and Executive Summary. It tailors the draft to your company's certifications and experience.",
    whyItMatters:
      "Writing a government proposal from scratch takes 20-40 hours. The AI cuts that to 6-8 hours of review and polish. You respond to more opportunities in less time, which directly increases your win rate.",
    howToUseIt: [
      "Mark an opportunity as Bidding in your Pipeline.",
      "Go to the Proposals page.",
      "Click Generate Draft next to the opportunity.",
      "Wait 30-60 seconds while the AI writes.",
      "Review the three tabs: Technical Approach, Past Performance, Executive Summary.",
      "Copy the text or download as a document, then customize it with your specific details.",
    ],
    tips: "Use the Guidance field when regenerating to give specific instructions like \"focus more on our cybersecurity experience.\" The AI gets better at writing for your company as you build more past performance records.",
  },
  {
    num: "07",
    id: "past-performance-builder",
    title: "Past Performance Builder",
    maxGuideIndex: 11,
    whatItDoes:
      "Stores records of every contract you've delivered, tracks monthly performance, and generates ready-to-use narratives for future proposals. Records are created automatically when you win a contract in the Pipeline.",
    whyItMatters:
      "Past performance is one of the highest-weighted evaluation factors in federal proposals. Most contractors scramble to write past performance narratives at proposal time. With ContractsIntel, you log monthly and the narratives write themselves.",
    howToUseIt: [
      "When you win a contract, a record is created automatically.",
      "Each month, click Log This Month and enter what you delivered (5 minutes).",
      "When you need past performance for a proposal, click Generate PPQ.",
      "The AI creates formatted narratives from your logged data.",
      "Copy and paste directly into your proposal.",
    ],
    tips: "Log your performance every month, even if it feels repetitive. The more data the AI has, the stronger your narratives. A 12-month log produces much better narratives than a 3-month log.",
  },
  {
    num: "08",
    id: "contract-delivery-dashboard",
    title: "Contract Delivery Dashboard",
    maxGuideIndex: 11,
    whatItDoes:
      "Tracks every deliverable, report, invoice, and option period for your active contracts. Sends alerts at 14, 7, 3, and 1 day before each deadline. Flags late government payments under the Prompt Payment Act.",
    whyItMatters:
      "One missed deliverable can end a contract relationship. One late invoice you didn't follow up on is money the government legally owes you. This dashboard makes sure nothing slips and nothing goes unpaid.",
    howToUseIt: [
      "Contracts appear automatically when you win in the Pipeline.",
      "Review your milestone timeline each week.",
      "Add custom milestones for deliverables specific to your contract.",
      "When you submit an invoice, enter the amount and date -- the system tracks the 30-day payment window.",
      "If the government is late paying, click Flag Late Payment to generate a Prompt Payment Act demand letter.",
    ],
    tips: "Check this page weekly, not just when you get an alert. If a payment is more than 15 days late, flag it -- you're legally entitled to interest.",
  },
  {
    num: "09",
    id: "state-local-monitoring",
    title: "State & Local Monitoring",
    maxGuideIndex: 11,
    whatItDoes:
      "Monitors procurement portals across all 50 states plus local government opportunities. Matches state and local contracts to your NAICS codes just like the federal matching engine.",
    whyItMatters:
      "State and local contracts are often less competitive than federal ones. Many small contractors ignore this $500 billion market. Adding state and local to your pipeline diversifies your revenue.",
    howToUseIt: [
      "Your matched state and local opportunities appear in the same daily digest alongside federal ones.",
      "They're tagged with the state/locality name so you can filter them.",
      "Track and bid on them using the same Pipeline workflow.",
    ],
    tips: "Start with your home state -- you'll have a geographic advantage. State contracts often have faster award timelines than federal.",
  },
  {
    num: "10",
    id: "agency-relationship-mapping",
    title: "Agency Relationship Mapping",
    maxGuideIndex: 11,
    whatItDoes:
      "Tracks contracting officers, program managers, and decision-makers at every agency you interact with. Builds a relationship map over time as you bid and win contracts.",
    whyItMatters:
      "Government contracting is relationship-driven. Knowing who the contracting officer is, what they've bought before, and how they evaluate proposals gives you a real advantage.",
    howToUseIt: [
      "Contact information is pulled automatically from SAM.gov opportunity data.",
      "When you interact with agency personnel, add notes to their profile.",
      "Before bidding, check if you've worked with anyone at that agency before.",
      "Reference prior relationships in your proposals where appropriate.",
    ],
    tips: "The best time to build agency relationships is before there's an opportunity. Use this tool to identify agencies where you have connections.",
  },
  {
    num: "11",
    id: "weekly-pipeline-report",
    title: "Weekly Pipeline Report",
    maxGuideIndex: 11,
    whatItDoes:
      "Every Monday morning, you receive an email summarizing your pipeline: total value by stage, upcoming deadlines, win rate trends, and recommended actions.",
    whyItMatters:
      "It's easy to lose track of the big picture when you're focused on individual bids. The weekly report forces you to step back and see your entire pipeline at a glance.",
    howToUseIt: [
      "Check your email every Monday morning.",
      "Review the pipeline summary -- are you tracking enough opportunities?",
      "Check deadlines for the coming week.",
      "Act on the recommended actions.",
    ],
    tips: "If your pipeline total value is less than 3x your annual revenue target, you need to track more opportunities.",
  },
  {
    num: "12",
    id: "cpars-monitor",
    title: "CPARS Monitor",
    maxGuideIndex: 16,
    whatItDoes:
      "Tracks your CPARS (Contractor Performance Assessment Reporting System) ratings -- the government's report card on your work. When you receive a rating below Satisfactory, the AI generates a formal response draft.",
    whyItMatters:
      "CPARS ratings directly affect your ability to win future contracts. A Marginal or Unsatisfactory rating can follow you for years. A well-written response stays in the record and can offset the damage.",
    howToUseIt: [
      "When you receive a CPARS evaluation, enter the ratings here.",
      "Select the category (Quality, Schedule, Cost Control, etc.) and rating level.",
      "If any rating is Marginal or Unsatisfactory, click Generate Response.",
      "Review the AI draft, customize it, then submit through the official CPARS system.",
    ],
    tips: "Always respond to low ratings -- even Satisfactory ratings can benefit from a contractor response highlighting your best work. Reference your monthly performance logs as evidence.",
  },
  {
    num: "13",
    id: "subcontracting-network",
    title: "Subcontracting Network",
    maxGuideIndex: 16,
    whatItDoes:
      "Connects you with prime contractors looking for certified small businesses to join their teams on government bids. You get matched automatically based on your certifications and NAICS codes.",
    whyItMatters:
      "Large primes need certified subs to meet their small business subcontracting goals. This is inbound business development -- primes come to you instead of you cold-calling them. One teaming relationship can generate years of subcontract revenue.",
    howToUseIt: [
      "Browse teaming opportunities that match your certifications.",
      "Check the match score -- higher means better fit.",
      "Click Express Interest to notify the prime contractor.",
      "The prime sees your profile and past performance.",
      "If you're a prime looking for subs, post your own teaming need.",
    ],
    tips: "Respond quickly -- primes often select from the first 5-10 responses. A strong past performance library makes you much more attractive as a teaming partner.",
  },
  {
    num: "14",
    id: "competitor-intelligence",
    title: "Competitor Intelligence",
    maxGuideIndex: 16,
    whatItDoes:
      "Automatically builds profiles of companies you compete against. Tracks your win/loss record against each competitor and identifies their patterns -- which agencies they win at, what NAICS codes they focus on, and whether they tend to win on price or technical merit.",
    whyItMatters:
      "Knowing your competition is half the battle. If you know a competitor wins on price at a specific agency, you can adjust your strategy. If you know they have weak past performance in a certain area, you can emphasize your strength there.",
    howToUseIt: [
      "Competitor profiles are built automatically when you record wins and losses in your Pipeline.",
      "Enter the winner's name when you lose a bid.",
      "View encounter history to see patterns.",
      "Click Analyze for AI-generated competitive strategy recommendations.",
    ],
    tips: "The more bids you track -- wins AND losses -- the more useful this data becomes. Before writing a proposal, always check if you've competed against the incumbent before.",
  },
  {
    num: "15",
    id: "loss-analysis-debriefs",
    title: "Loss Analysis & Debriefs",
    maxGuideIndex: 16,
    whatItDoes:
      "When you lose a bid, the AI analyzes why and generates specific recommendations for next time. It looks at the opportunity details, your approach, the loss reason, and winner information to identify what to change.",
    whyItMatters:
      "Most contractors lose bids and move on without understanding why. The same mistakes repeat. Loss analysis turns every loss into a lesson that makes your next proposal stronger.",
    howToUseIt: [
      "When you move an opportunity to Lost in your Pipeline, enter the loss reason and winner name.",
      "The AI automatically generates a loss analysis.",
      "Review the \"Why you likely lost\" section.",
      "Read the \"What to do differently\" recommendations.",
      "Check the loss trends view to spot patterns across multiple bids.",
    ],
    tips: "Be honest when entering loss reasons -- \"price\" vs \"technical\" vs \"past performance\" helps the AI give better advice. If you lost 3 times at the same agency on price, the AI will tell you.",
  },
  {
    num: "16",
    id: "contract-vehicle-alerts",
    title: "Contract Vehicle Alerts",
    maxGuideIndex: 16,
    whatItDoes:
      "Monitors major government contract vehicles like GSA MAS, OASIS+, CIO-SP4, and Alliant 3. When a vehicle opens for new vendors (called an \"on-ramp\"), you get alerted if your NAICS codes and certifications qualify.",
    whyItMatters:
      "Being on a contract vehicle gives you access to task orders worth billions that non-vehicle holders can't bid on. Missing an on-ramp means waiting years for the next one. These windows are rare and time-sensitive.",
    howToUseIt: [
      "Your eligible vehicles are shown automatically based on your NAICS codes.",
      "You see the status of each vehicle (Open or Closed).",
      "When an on-ramp opens, you get an email alert with the deadline and application link.",
      "The system tracks which vehicles you're on and which you should apply for.",
    ],
    tips: "GSA MAS (Multiple Award Schedule) is the most common starting point -- it's almost always open for new vendors. Start there if you're not on any vehicle yet.",
  },
];

// ─── Main Page Component ────────────────────────────────────────────────

export default function GetStartedPage() {
  const { organization, user } = useDashboard();
  const supabase = createClient();
  const trialActive = isTrialActive(organization);

  const [checklist, setChecklist] = useState({
    account_created: true,
    sam_connected: false,
    first_digest_reviewed: false,
    first_opportunity_tracked: false,
    calendar_connected: false,
    compliance_reviewed: false,
    first_proposal_generated: false,
  });
  const [loading, setLoading] = useState(true);
  const [tourActive, setTourActive] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    // Check SAM connected
    const samConnected = !!(organization.uei);

    // Check if any opportunity has been tracked
    const { count: trackedCount } = await supabase
      .from("opportunity_matches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .in("user_status", ["tracking", "bidding"]);

    // Check proposals
    const { count: proposalCount } = await supabase
      .from("proposal_drafts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id);

    setChecklist({
      account_created: true,
      sam_connected: samConnected,
      first_digest_reviewed: false, // checked via preference
      first_opportunity_tracked: (trackedCount ?? 0) > 0,
      calendar_connected: false, // checked via preference
      compliance_reviewed: false, // checked via preference
      first_proposal_generated: (proposalCount ?? 0) > 0,
    });

    // Load preferences
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (prefs) {
      setChecklist((prev) => ({
        ...prev,
        first_digest_reviewed: prefs.checklist_first_digest_reviewed ?? false,
        calendar_connected: prefs.google_calendar_connected ?? prefs.checklist_calendar_connected ?? false,
        compliance_reviewed: prefs.checklist_compliance_reviewed ?? false,
      }));
    }

    setLoading(false);
  }, [organization, user.id, supabase]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const handleSetHomepage = async () => {
    await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, default_page: "dashboard" },
        { onConflict: "user_id" }
      );
    window.location.href = "/dashboard";
  };

  const handleRestartTour = () => {
    localStorage.removeItem("ci_tour_completed");
    setTourActive(true);
  };

  // Build checklist items
  const items = [
    {
      key: "account_created",
      label: "Create your account",
      done: checklist.account_created,
      detail: `Done — signed up ${new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    },
    {
      key: "sam_connected",
      label: "Connect your SAM.gov profile",
      done: checklist.sam_connected,
      detail: checklist.sam_connected
        ? `Done — UEI verified, ${organization.certifications?.length ?? 0} certifications loaded`
        : "Enter your UEI in Settings to connect",
      link: !checklist.sam_connected ? "/dashboard/settings" : undefined,
      linkLabel: "Go to Settings",
    },
    {
      key: "first_digest_reviewed",
      label: "Review your first daily digest",
      done: checklist.first_digest_reviewed,
      detail: checklist.first_digest_reviewed
        ? "Done"
        : "Your first digest arrives tomorrow at 7am",
    },
    {
      key: "first_opportunity_tracked",
      label: "Track your first opportunity",
      done: checklist.first_opportunity_tracked,
      detail: checklist.first_opportunity_tracked
        ? "Done"
        : 'Go to Dashboard and click "Track" on any opportunity that interests you',
      link: !checklist.first_opportunity_tracked ? "/dashboard" : undefined,
      linkLabel: "Go to Dashboard",
    },
    {
      key: "calendar_connected",
      label: "Connect Google Calendar",
      done: checklist.calendar_connected,
      detail: checklist.calendar_connected
        ? "Done — deadlines syncing"
        : "Push deadlines to your phone automatically",
      link: !checklist.calendar_connected ? "/dashboard/settings" : undefined,
      linkLabel: "Connect Now",
    },
    {
      key: "compliance_reviewed",
      label: "Review your compliance score",
      done: checklist.compliance_reviewed,
      detail: checklist.compliance_reviewed
        ? "Done"
        : "Check your SAM registration, certifications, and CMMC status",
      link: !checklist.compliance_reviewed ? "/dashboard/compliance" : undefined,
      linkLabel: "View Compliance",
    },
  ];

  // Add proposal item for BD Pro+
  const bdPro = trialActive || organization.plan === "bd_pro" || organization.plan === "team";
  if (bdPro) {
    items.push({
      key: "first_proposal_generated",
      label: "Generate your first proposal draft",
      done: checklist.first_proposal_generated,
      detail: checklist.first_proposal_generated
        ? "Done"
        : 'Mark any opportunity as "Bidding" then go to Proposals to generate an AI draft',
      link: !checklist.first_proposal_generated ? "/dashboard/proposals" : undefined,
      linkLabel: "Go to Proposals",
    });
  }

  const completedCount = items.filter((i) => i.done).length;
  const totalItems = items.length;
  const progressPct = Math.round((completedCount / totalItems) * 100);

  // Build guides based on tier
  // During trial: all 16. After trial: Discovery 1-5, BD Pro 1-11, Team 1-16
  const maxGuide = trialActive
    ? 16
    : organization.plan === "team"
      ? 16
      : organization.plan === "bd_pro"
        ? 11
        : 5;

  const visibleGuides = ALL_GUIDES.slice(0, maxGuide);

  return (
    <div>
      {tourActive && (
        <ProductTour onComplete={() => setTourActive(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-serif text-[#e8edf8]">Get Started</h1>
          <p className="text-sm text-[#8b9ab5] mt-1">
            Welcome to ContractsIntel, {organization.name}. Here is everything
            you need to get up and running.
          </p>
        </div>
        <HelpButton page="dashboard" />
      </div>

      {/* Progress Checklist */}
      <div className="border border-[#1e2535] bg-[#0d1018] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75]">
            Your setup progress: {completedCount} of {totalItems} complete
          </h2>
        </div>
        <div className="w-full h-2 bg-[#111520] mb-6">
          <div
            className="h-full bg-[#2563eb] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.key} className="flex items-start gap-3">
              <div
                className={`w-5 h-5 border flex items-center justify-center shrink-0 mt-0.5 ${
                  item.done
                    ? "border-[#22c55e] bg-[#22c55e]/10"
                    : "border-[#1e2535]"
                }`}
              >
                {item.done && (
                  <svg
                    className="w-3 h-3 text-[#22c55e]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="square"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <div>
                <p
                  className={`text-sm ${
                    item.done ? "text-[#e8edf8]" : "text-[#8b9ab5]"
                  }`}
                >
                  {item.label}
                </p>
                <p className="text-xs text-[#4a5a75] mt-0.5">{item.detail}</p>
                {item.link && (
                  <Link
                    href={item.link}
                    className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors mt-1 inline-block"
                  >
                    {item.linkLabel} &rarr;
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={handleRestartTour}
          className="border border-[#1e2535] text-[#8b9ab5] px-4 py-2 text-sm hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors"
        >
          Restart Product Tour
        </button>
        <button
          onClick={handleSetHomepage}
          className="border border-[#1e2535] text-[#8b9ab5] px-4 py-2 text-sm hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors"
        >
          Set Dashboard as Homepage
        </button>
      </div>

      {/* Quick Start Guide intro */}
      <div className="border border-[#1e2535] bg-[#0d1018] p-6 mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">
          Quick Start Guide
        </h2>
        <p className="text-sm text-[#8b9ab5]">
          Below: written guide for every product in your plan. Each section
          explains what it does, why it matters, and exactly how to use it —
          step by step.
        </p>
      </div>

      {/* Product Guides */}
      <div className="space-y-4">
        {visibleGuides.map((guide) => {
          const isOpen = expandedGuide === guide.id;
          const tierLabel =
            guide.maxGuideIndex <= 5
              ? null
              : guide.maxGuideIndex <= 11
                ? "BD Pro"
                : "Team";
          return (
            <div
              key={guide.id}
              className="border border-[#1e2535] bg-[#0d1018]"
            >
              <button
                onClick={() =>
                  setExpandedGuide(isOpen ? null : guide.id)
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-[#111520] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#3b82f6]">
                    {guide.num}
                  </span>
                  <h3 className="text-sm font-medium text-[#e8edf8]">
                    {guide.title}
                  </h3>
                  {tierLabel && (
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase border border-[#2563eb]/30 text-[#3b82f6] bg-[#2563eb]/5">
                      {tierLabel}
                    </span>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-[#4a5a75] transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="square"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isOpen && (
                <div className="px-5 pb-6 pt-2 border-t border-[#1e2535]">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">
                        What it does
                      </h4>
                      <p className="text-sm text-[#8b9ab5] leading-relaxed">
                        {guide.whatItDoes}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">
                        Why it matters
                      </h4>
                      <p className="text-sm text-[#8b9ab5] leading-relaxed">
                        {guide.whyItMatters}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">
                        How to use it
                      </h4>
                      <ol className="space-y-2">
                        {guide.howToUseIt.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm text-[#8b9ab5] leading-relaxed">
                            <span className="text-[#3b82f6] font-mono shrink-0">
                              {i + 1}.
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">
                        Tips
                      </h4>
                      <p className="text-sm text-[#8b9ab5] leading-relaxed">
                        {guide.tips}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
