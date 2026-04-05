"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isDiscovery, isBdProOrHigher, isTeam } from "@/lib/feature-gate";
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
  id: string;
  title: string;
  tier: "all" | "bd_pro" | "team";
  content: React.ReactNode;
}

function guide1(): GuideSection {
  return {
    id: "daily-digest",
    title: "Daily Digest & Opportunity Matching",
    tier: "all",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Every night while you sleep, ContractsIntel scans over 35,000 government procurement websites looking for new contract opportunities. It checks each one against your specific certifications (like 8(a), SDVOSB, WOSB, or HUBZone) and your NAICS codes (the government&apos;s system for classifying what your business does). By 7am, a ranked list of your best matches lands in your email inbox and on your dashboard.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Most small contractors check SAM.gov manually every few days. Studies show this means you miss 68% of eligible opportunities — contracts that are set aside specifically for businesses with your certifications. A single missed contract could be worth $150,000 to $2,000,000. This product makes sure you never miss one again.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Check your email every morning.</strong> Your digest arrives at 7am. Open it to see your top 10 matched opportunities ranked by fit score (0 to 100). The higher the score, the better the match for your business.
            </p>
            <MockDigestEmail />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Review the recommendations.</strong> Each opportunity has a recommendation:
            </p>
            <ul className="space-y-1 text-sm text-[#8b9ab5] ml-4">
              <li><span className="text-[#22c55e] font-medium">BID</span> (green) — This is a strong match. You should seriously consider submitting a proposal.</li>
              <li><span className="text-[#f59e0b] font-medium">MONITOR</span> (yellow) — Keep watching this one. It might become a better fit as more details are released.</li>
              <li><span className="text-[#4a5a75] font-medium">SKIP</span> (gray) — This does not match your strengths. Do not waste time on it.</li>
            </ul>
            <MockOpportunityCard />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Take action.</strong> Click <strong className="text-[#e8edf8]">&quot;Track&quot;</strong> to save an opportunity to your Pipeline. Click <strong className="text-[#e8edf8]">&quot;Bid&quot;</strong> when you decide to pursue it. Click <strong className="text-[#e8edf8]">&quot;Skip&quot;</strong> to remove it from your feed.
            </p>
            <MockActionButtons />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Use the filters.</strong> Filter your opportunities by certification type, agency, minimum match score, or deadline. For example, if you only want to see SDVOSB set-asides closing in the next two weeks, set those filters and everything else disappears.
            </p>
            <MockFilterBar />
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Focus on opportunities scoring 80 or higher first. These are your strongest matches and where you should spend your bid preparation time.</li>
            <li>Check the &quot;Urgent&quot; counter daily. Opportunities closing within 7 days need immediate attention or you will miss them.</li>
            <li>Update your NAICS codes in Settings whenever you add new capabilities. Better codes mean better matches.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide2(): GuideSection {
  return {
    id: "pipeline",
    title: "Pipeline Tracker",
    tier: "all",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            The Pipeline Tracker organizes every government contract opportunity you are pursuing into clear stages. Think of it like a kanban board (a visual board with columns) where each column represents how far along you are in the bidding process. You can see at a glance what needs attention today.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Most small contractors track their bids in spreadsheets or their heads. This leads to missed deadlines and lost revenue. The average small government contractor pursues 8 to 15 opportunities at a time. Without a system, things fall through the cracks. The Pipeline makes sure nothing gets lost and shows you your win rate over time.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Add opportunities from your dashboard.</strong> When you click <strong className="text-[#e8edf8]">&quot;Track&quot;</strong> or <strong className="text-[#e8edf8]">&quot;Bid&quot;</strong> on any opportunity card, it automatically appears in your Pipeline.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Move opportunities through stages.</strong> Use the dropdown on each card to move it between Monitoring, Preparing Bid, Submitted, Won, and Lost. The stages match a typical government bid lifecycle.
            </p>
            <MockPipeline />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Mark wins and losses.</strong> When you win a contract, click <strong className="text-[#e8edf8]">&quot;Mark as Won&quot;</strong> and enter the award amount. ContractsIntel will automatically create a delivery dashboard with milestones and start a past performance record. When you lose, enter the winner and the reason — this data helps you improve over time.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Review your pipeline stats.</strong> The top of the Pipeline page shows your total pipeline value, number of active bids, and your win rate. A healthy win rate for small government contractors is 20% to 40%.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Always record why you lost a bid. After 10 to 20 recorded losses, you will start seeing patterns — maybe you lose on price at certain agencies or need stronger past performance in a specific NAICS code.</li>
            <li>Review your pipeline at least once a week. Move stale opportunities to &quot;Lost&quot; so your pipeline value stays accurate.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide3(): GuideSection {
  return {
    id: "compliance",
    title: "Compliance Monitor",
    tier: "all",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            The Compliance Monitor tracks every government regulation, certification, and registration that affects your ability to bid on and win federal contracts. It gives you a health score from 0 to 100 so you know at a glance if anything needs attention. It also watches for changes to the Federal Acquisition Regulation (FAR) — the massive set of rules that govern all government purchasing.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            One lapsed SAM.gov registration means you cannot bid on any federal contract until it is renewed. One missed certification renewal means you lose your set-aside eligibility (the advantage that reserves contracts just for businesses like yours). These mistakes happen all the time and they cost small businesses hundreds of thousands of dollars in lost revenue.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Check your health score.</strong> Open the Compliance page and look at your score. Green (80 to 100) means you are in good shape. Yellow (50 to 79) means something needs attention soon. Red (below 50) means act immediately.
            </p>
            <MockComplianceDashboard />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Review the deadline list.</strong> Each compliance item shows a color-coded status. Red items are due within 30 days. Yellow items are due within 90 days. Green items are current and do not need action yet.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Act on alerts.</strong> When you get a compliance alert email, click through to the Compliance page and follow the instructions. Most items link directly to the government website where you need to take action (like SAM.gov for registration renewal).
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Track your CMMC status.</strong> CMMC (Cybersecurity Maturity Model Certification) is a requirement for most Department of Defense contracts. Set your target level in Settings and the system tracks your progress toward assessment readiness.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Set your SAM.gov registration to auto-renew, but still monitor it here. Auto-renew sometimes fails and you will not know until you try to bid.</li>
            <li>Read FAR change alerts carefully. A new rule might require changes to your proposal templates or business processes.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide4(): GuideSection {
  return {
    id: "calendar",
    title: "Google Calendar Sync",
    tier: "all",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Calendar Sync pushes every important deadline from ContractsIntel directly to your Google Calendar. Bid response deadlines, compliance due dates, contract milestones, and meeting reminders all show up on your phone and desktop calendar with automatic reminders.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Government contracting runs on deadlines. A proposal submitted one minute after the deadline is automatically rejected — no exceptions. Calendar sync means every critical date is on your phone with push notifications. Even if you forget to check the dashboard, your calendar will remind you.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Go to Settings.</strong> Click <strong className="text-[#e8edf8]">&quot;Settings&quot;</strong> in the sidebar, scroll down to the Google Calendar section, and click <strong className="text-[#e8edf8]">&quot;Connect Google Calendar.&quot;</strong>
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Authorize access.</strong> Google will ask you to allow ContractsIntel to create calendar events. Click &quot;Allow.&quot; This only gives us permission to add events — we cannot read your existing calendar.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Choose what to sync.</strong> You can toggle which types of deadlines sync to your calendar: bid deadlines, compliance deadlines, contract milestones, and meeting reminders.
            </p>
            <MockCalendarSync />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: To disconnect,</strong> go back to Settings and click <strong className="text-[#e8edf8]">&quot;Disconnect Calendar.&quot;</strong> All ContractsIntel events will be removed from your calendar.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Connect your calendar on day one. It takes 30 seconds and you will never miss a deadline.</li>
            <li>If you use a shared team calendar, connect that one instead of your personal calendar so everyone on your team sees the deadlines.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide5(): GuideSection {
  return {
    id: "proposals",
    title: "AI Proposal Drafts",
    tier: "bd_pro",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            The AI Proposal Drafts tool reads a government solicitation (the official document describing what the government wants to buy) and writes a first draft of your proposal. It creates three sections: your Technical Approach (how you will do the work), Past Performance narrative (proof you have done similar work before), and Executive Summary (a short overview for evaluators).
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Writing a government proposal from scratch takes 20 to 40 hours for a typical small business. That is time you are not spending on delivery or business development. The AI draft cuts that to 6 to 8 hours of review and polish. For a company bidding on 5 to 10 contracts a year, that is hundreds of hours saved.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Mark an opportunity as &quot;Bidding.&quot;</strong> On your Dashboard or Pipeline, click the <strong className="text-[#e8edf8]">&quot;Bid&quot;</strong> button on any opportunity you want to pursue.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Go to Proposals.</strong> Click <strong className="text-[#e8edf8]">&quot;Proposals&quot;</strong> in the sidebar. You will see the opportunity listed. Click <strong className="text-[#e8edf8]">&quot;Generate Draft.&quot;</strong>
            </p>
            <MockProposalDraft />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Review the three tabs.</strong> Switch between Technical Approach, Past Performance, and Executive Summary. Each section is tailored to the specific solicitation requirements and your company profile.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Regenerate with guidance.</strong> If the draft needs a different focus, type specific instructions in the Guidance field (for example, &quot;Emphasize our cybersecurity experience&quot;) and click <strong className="text-[#e8edf8]">&quot;Regenerate.&quot;</strong>
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 5: Copy or download.</strong> Use the <strong className="text-[#e8edf8]">&quot;Copy&quot;</strong> button to copy text to your clipboard, or <strong className="text-[#e8edf8]">&quot;Download&quot;</strong> to save as a document.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Always review and customize the draft. It is a starting point, not a finished proposal. Add your specific project examples, team bios, and pricing details.</li>
            <li>The AI gets better at writing for your company over time as you build more past performance records in the system.</li>
            <li>Use the Guidance field to steer the AI. Be specific: &quot;Focus on our 3 VA contracts from 2024&quot; works better than &quot;make it better.&quot;</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide6(): GuideSection {
  return {
    id: "past-performance",
    title: "Past Performance Builder",
    tier: "bd_pro",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            The Past Performance Builder creates a library of every contract you have delivered. It tracks your work month by month and uses that data to generate Past Performance Questionnaire (PPQ) narratives — the formatted descriptions of your work that evaluators read when scoring your proposals.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Past performance is one of the most important evaluation factors in federal proposals. Evaluators want proof that you have done similar work before and done it well. Most small contractors scramble to write these narratives from memory when a proposal is due. With ContractsIntel, you log your work every month (5 minutes) and the AI writes your narratives on demand.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Records are created automatically.</strong> When you mark an opportunity as &quot;Won&quot; in your Pipeline, a past performance record is created. You can also create records manually for contracts you had before joining ContractsIntel.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Log your performance monthly.</strong> Each month you get an email reminder. Click through to log what you delivered: deliverables completed, milestones met, issues resolved, and any client feedback. This takes about 5 minutes.
            </p>
            <MockPastPerformance />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Generate PPQ narratives.</strong> When you need past performance text for a proposal, click <strong className="text-[#e8edf8]">&quot;Generate PPQ Narrative.&quot;</strong> The AI creates a formatted narrative from your logged data — ready to paste into your proposal.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Search by NAICS or agency.</strong> When writing a proposal, search your library to find the most relevant past performance. For example, if you are bidding on a VA IT contract, search for &quot;VA&quot; and &quot;541512&quot; to find your best matching records.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Log your performance every month without fail. The more data the AI has, the stronger and more specific your narratives will be. Three months of detailed logs produce much better narratives than one hasty entry.</li>
            <li>Include specific numbers whenever possible: &quot;Resolved 247 helpdesk tickets with a 98% satisfaction rating&quot; is much stronger than &quot;provided IT support.&quot;</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide7(): GuideSection {
  return {
    id: "contracts",
    title: "Contract Delivery Dashboard",
    tier: "bd_pro",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            The Contract Delivery Dashboard tracks everything that happens after you win a contract. It monitors every deliverable deadline, monthly report, quarterly review, invoice, and option period (the government&apos;s right to extend your contract for additional years). It also tracks whether the government is paying you on time.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Winning a contract is only the beginning. A missed deliverable or late report can result in a poor CPARS rating, which makes it harder to win future contracts. And if the government is late paying you, you are legally entitled to interest under the Prompt Payment Act — but only if you track it and file a claim. For example, if you win a $500,000 VA contract, ContractsIntel automatically creates a delivery dashboard with monthly report deadlines for the next 12 months.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Win a contract.</strong> When you mark an opportunity as &quot;Won&quot; in the Pipeline, the delivery dashboard is created automatically with standard milestones.
            </p>
            <MockContractDashboard />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Add custom milestones.</strong> Click <strong className="text-[#e8edf8]">&quot;Add Milestone&quot;</strong> to create deadlines specific to your contract, like &quot;Submit Security Plan&quot; or &quot;Complete Phase 1 Testing.&quot;
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Track invoices.</strong> Enter each invoice with the amount and submission date. The system calculates the due date (30 days per the Prompt Payment Act) and alerts you if payment is late.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Flag late payments.</strong> If the government has not paid within 30 days, click <strong className="text-[#e8edf8]">&quot;Flag Late Payment.&quot;</strong> The system generates a formal Prompt Payment Act demand letter that you can send to the contracting officer.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Check this page weekly, not just when you get an alert. Staying ahead of deadlines prevents last-minute scrambles.</li>
            <li>If a government payment is more than 15 days late, flag it right away. You are legally entitled to interest and the government takes these notices seriously.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide8(): GuideSection {
  return {
    id: "cpars",
    title: "CPARS Monitor",
    tier: "team",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            CPARS (Contractor Performance Assessment Reporting System) is the government&apos;s official system for rating your work. This tool tracks all your CPARS ratings in one place, shows trends over time, and generates professional responses when you receive a low rating.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            CPARS ratings follow your company for years. A single &quot;Marginal&quot; or &quot;Unsatisfactory&quot; rating can cost you future contracts because evaluators check your CPARS history when scoring proposals. On the other hand, &quot;Exceptional&quot; and &quot;Very Good&quot; ratings are powerful proof of your capabilities. Managing these ratings actively is critical to long-term success.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Enter your ratings.</strong> When you receive a CPARS evaluation from a contracting officer, enter each category rating: Quality, Schedule, Cost Control, Management, and Small Business Subcontracting.
            </p>
            <MockCpars />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: View trends.</strong> The system tracks your ratings over time so you can see if performance is improving or declining in any category.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Respond to low ratings.</strong> If any rating comes in below Satisfactory, click <strong className="text-[#e8edf8]">&quot;Generate Response.&quot;</strong> The AI writes a professional response citing evidence from your performance logs. You have 14 calendar days to respond.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Always respond to Marginal or Unsatisfactory ratings, even if you disagree. A well-written response stays in the permanent record and future evaluators will read it.</li>
            <li>Reference your Exceptional ratings in proposals. They are your strongest proof of quality work.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide9(): GuideSection {
  return {
    id: "network",
    title: "Subcontracting Network",
    tier: "team",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            The Subcontracting Network matches you with large prime contractors (companies like Lockheed Martin, Booz Allen, or CBRE) who need certified small businesses as teaming partners on government bids. It works like a matchmaking service — primes post what they need and the system matches against your certifications and capabilities.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Large prime contractors are required by law to subcontract a percentage of their work to certified small businesses. This creates a massive market for companies like yours. But finding these opportunities normally requires networking, cold calls, and attending industry days. The Network brings these opportunities directly to you, matched to your specific certifications and NAICS codes.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Browse teaming opportunities.</strong> Open the Network page to see prime contractors looking for businesses with your certifications.
            </p>
            <MockNetwork />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Express interest.</strong> Click <strong className="text-[#e8edf8]">&quot;Express Interest&quot;</strong> on any match. The prime sees your company profile, certifications, and past performance — everything they need to decide.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Post your own needs.</strong> If you are acting as a prime contractor and need small business subcontractors, click <strong className="text-[#e8edf8]">&quot;Post Teaming Need&quot;</strong> to find matches.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>Respond within 24 hours. Primes often select from the first 5 to 10 responses they receive.</li>
            <li>A strong past performance library makes you much more attractive as a teaming partner. Log your monthly performance to build it up.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide10(): GuideSection {
  return {
    id: "competitors",
    title: "Competitor Intelligence",
    tier: "team",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Competitor Intelligence automatically builds profiles of the companies you compete against in government bids. It tracks your win/loss record against each competitor, identifies their patterns (which agencies they win at, what they focus on), and generates AI analysis to help you compete more effectively.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Knowing your competition is one of the biggest advantages in government contracting. If you know the incumbent tends to win on past performance, you can strengthen that section of your proposal. If you know a competitor always underbids, you can focus on technical quality instead. This data turns guesswork into strategy.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Track your wins and losses.</strong> Competitor profiles are built automatically when you record bid outcomes in the Pipeline. Always enter the winner&apos;s name when you lose a bid.
            </p>
            <MockCompetitors />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: View competitor profiles.</strong> Each profile shows the competitor&apos;s primary agencies, NAICS codes, and your win/loss record against them.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Read the AI analysis.</strong> Click <strong className="text-[#e8edf8]">&quot;View Analysis&quot;</strong> for AI-generated insights about competing against this company, including strategies for your next proposal.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 4: Add competitors manually.</strong> If you know a competitor from industry events or previous bids, click <strong className="text-[#e8edf8]">&quot;Add Competitor&quot;</strong> to start tracking them before your next encounter.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>The more bids you track (both wins and losses), the more useful the intelligence becomes. Even losses are valuable data.</li>
            <li>Before writing a proposal, check if you have competed against the incumbent before. Your competitor profile might reveal their weaknesses.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

function guide11(): GuideSection {
  return {
    id: "vehicle-alerts",
    title: "Contract Vehicle Alerts",
    tier: "team",
    content: (
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">What it does</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Contract Vehicle Alerts monitors government-wide contract vehicles (like the GSA Schedule and GWACs) and notifies you when application windows open. A contract vehicle is like a pre-approved list — once you are on it, agencies can buy from you directly without a full competition. Getting on the right vehicle can multiply your revenue.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Why it matters</h4>
          <p className="text-sm text-[#8b9ab5] leading-relaxed">
            Contract vehicles account for over 40% of all federal procurement spending. If you are not on the right vehicles, you are invisible to a huge portion of the market. But vehicle on-ramp windows (when they accept new applications) are unpredictable and easy to miss. A missed on-ramp could mean waiting 2 to 5 years for the next chance. This tool makes sure you never miss one.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">How to use it</h4>
          <div className="space-y-4">
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 1: Review vehicle alerts.</strong> When a vehicle on-ramp opens that matches your NAICS codes, you will see an alert on your dashboard and receive an email notification.
            </p>
            <MockVehicleAlerts />
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 2: Check your eligibility.</strong> Each alert shows whether your current certifications and NAICS codes qualify you for the vehicle.
            </p>
            <p className="text-sm text-[#8b9ab5] leading-relaxed">
              <strong className="text-[#e8edf8]">Step 3: Begin your application.</strong> The alert links to the official application page and includes the deadline. Vehicle applications typically take 30 to 90 days to prepare, so start early.
            </p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-2">Tips</h4>
          <ul className="space-y-2 text-sm text-[#8b9ab5]">
            <li>The GSA Schedule is the most commonly used vehicle. If you do not have one yet, apply at the first opportunity — it opens doors to thousands of agencies.</li>
            <li>GWACs (Government-Wide Acquisition Contracts) like Alliant 2 and VETS 2 are harder to get on but extremely valuable for IT companies.</li>
          </ul>
        </div>
      </div>
    ),
  };
}

// ─── Main Page Component ────────────────────────────────────────────────

export default function GetStartedPage() {
  const { organization, user } = useDashboard();
  const supabase = createClient();
  const discovery = isDiscovery(organization.plan);
  const bdPro = isBdProOrHigher(organization.plan);
  const team = isTeam(organization.plan);

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
  const allGuides = [
    guide1(),
    guide2(),
    guide3(),
    guide4(),
    guide5(),
    guide6(),
    guide7(),
    guide8(),
    guide9(),
    guide10(),
    guide11(),
  ];

  const visibleGuides = allGuides.filter((g) => {
    if (g.tier === "all") return true;
    if (g.tier === "bd_pro") return bdPro;
    if (g.tier === "team") return team;
    return false;
  });

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
        {visibleGuides.map((guide, index) => (
          <div
            key={guide.id}
            className="border border-[#1e2535] bg-[#0d1018]"
          >
            <button
              onClick={() =>
                setExpandedGuide(
                  expandedGuide === guide.id ? null : guide.id
                )
              }
              className="w-full flex items-center justify-between p-5 text-left hover:bg-[#111520] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[#4a5a75]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-sm font-medium text-[#e8edf8]">
                  {guide.title}
                </h3>
                {guide.tier !== "all" && (
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase border border-[#2563eb]/30 text-[#3b82f6] bg-[#2563eb]/5">
                    {guide.tier === "bd_pro" ? "BD Pro" : "Team"}
                  </span>
                )}
              </div>
              <svg
                className={`w-4 h-4 text-[#4a5a75] transition-transform ${
                  expandedGuide === guide.id ? "rotate-180" : ""
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
            {expandedGuide === guide.id && (
              <div className="px-5 pb-6 pt-2 border-t border-[#1e2535]">
                {guide.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
