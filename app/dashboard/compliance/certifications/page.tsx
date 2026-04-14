"use client";

import { useDashboard } from "../../context";
import { useState } from "react";
import Link from "next/link";

interface CertResult {
  name: string;
  code: string;
  eligible: boolean;
  reason: string;
  benefits: string;
  soleSrcLimit: string;
  link: string;
}

const QUESTIONS = [
  { key: "revenue", label: "What is your average annual revenue (last 3 years)?", type: "select", options: [
    { value: "under_1m", label: "Under $1M" }, { value: "1m_5m", label: "$1M - $5M" },
    { value: "5m_15m", label: "$5M - $15M" }, { value: "15m_30m", label: "$15M - $30M" }, { value: "over_30m", label: "Over $30M" },
  ]},
  { key: "years_in_business", label: "How many years has your business been operating?", type: "select", options: [
    { value: "under_2", label: "Less than 2 years" }, { value: "2_5", label: "2-5 years" },
    { value: "5_10", label: "5-10 years" }, { value: "over_10", label: "Over 10 years" },
  ]},
  { key: "ownership_disadvantaged", label: "Is your business at least 51% owned by individuals who are socially and economically disadvantaged?", type: "yesno" },
  { key: "ownership_women", label: "Is your business at least 51% owned and controlled by one or more women?", type: "yesno" },
  { key: "ownership_veteran", label: "Is the business at least 51% owned by one or more veterans?", type: "yesno" },
  { key: "veteran_disabled", label: "Is the veteran owner(s) service-connected disabled?", type: "yesno" },
  { key: "hubzone_location", label: "Is your principal office located in a HUBZone? (Check at maps.certify.sba.gov)", type: "yesno" },
  { key: "hubzone_employees", label: "Do at least 35% of your employees live in a HUBZone?", type: "yesno" },
  { key: "us_citizens", label: "Are all owners U.S. citizens or permanent residents?", type: "yesno" },
  { key: "independently_owned", label: "Is your business independently owned and operated (not a subsidiary of a larger firm)?", type: "yesno" },
];

function evaluateCerts(answers: Record<string, string>): CertResult[] {
  const results: CertResult[] = [];
  const revenue = answers.revenue || "";
  const smallEnough = ["under_1m", "1m_5m", "5m_15m"].includes(revenue);

  // 8(a) Business Development
  const is8aEligible = answers.ownership_disadvantaged === "yes" && smallEnough &&
    answers.us_citizens === "yes" && answers.independently_owned === "yes" &&
    answers.years_in_business !== "under_2";
  results.push({
    name: "8(a) Business Development", code: "8a", eligible: is8aEligible,
    reason: is8aEligible
      ? "You appear to meet the basic eligibility criteria for the 8(a) program."
      : !answers.ownership_disadvantaged || answers.ownership_disadvantaged === "no" ? "Requires 51%+ ownership by socially & economically disadvantaged individuals."
      : !smallEnough ? "Revenue may exceed the size standard for your NAICS code."
      : "One or more basic requirements not met.",
    benefits: "Sole-source contracts, mentorship, 9-year program with business development support, federal contract set-asides.",
    soleSrcLimit: "$4.5M (services) / $7M (manufacturing)",
    link: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/8a-business-development-program",
  });

  // WOSB
  const isWosbEligible = answers.ownership_women === "yes" && smallEnough &&
    answers.us_citizens === "yes" && answers.independently_owned === "yes";
  results.push({
    name: "Women-Owned Small Business (WOSB)", code: "wosb", eligible: isWosbEligible,
    reason: isWosbEligible
      ? "You appear to qualify for WOSB certification."
      : answers.ownership_women !== "yes" ? "Requires 51%+ ownership and control by women."
      : "One or more requirements not met.",
    benefits: "Access to WOSB set-aside contracts in underrepresented industries, sole-source awards.",
    soleSrcLimit: "$4.5M (services) / $7M (manufacturing)",
    link: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contracting-program",
  });

  // EDWOSB
  const isEdwosbEligible = isWosbEligible && answers.ownership_disadvantaged === "yes";
  results.push({
    name: "Economically Disadvantaged WOSB (EDWOSB)", code: "edwosb", eligible: isEdwosbEligible,
    reason: isEdwosbEligible
      ? "You qualify for EDWOSB — broader set-aside access than WOSB alone."
      : !isWosbEligible ? "Must first qualify as WOSB."
      : "Requires economic disadvantage qualification.",
    benefits: "All WOSB benefits plus access to additional industry set-asides and sole-source contracts.",
    soleSrcLimit: "$4.5M (services) / $7M (manufacturing)",
    link: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contracting-program",
  });

  // SDVOSB
  const isSdvosbEligible = answers.ownership_veteran === "yes" && answers.veteran_disabled === "yes" &&
    smallEnough && answers.us_citizens === "yes";
  results.push({
    name: "Service-Disabled Veteran-Owned (SDVOSB)", code: "sdvosb", eligible: isSdvosbEligible,
    reason: isSdvosbEligible
      ? "You appear to qualify for SDVOSB certification."
      : answers.veteran_disabled !== "yes" ? "Requires service-connected disabled veteran owner (51%+)."
      : "One or more requirements not met.",
    benefits: "Set-aside and sole-source contracts across all agencies, especially VA and DoD.",
    soleSrcLimit: "$4.5M (services) / $7M (manufacturing)",
    link: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/veteran-assistance-programs",
  });

  // VOSB
  const isVosbEligible = answers.ownership_veteran === "yes" && smallEnough && answers.us_citizens === "yes";
  results.push({
    name: "Veteran-Owned Small Business (VOSB)", code: "vosb", eligible: isVosbEligible,
    reason: isVosbEligible
      ? "You qualify as a VOSB."
      : answers.ownership_veteran !== "yes" ? "Requires 51%+ veteran ownership."
      : "One or more requirements not met.",
    benefits: "VA set-aside contracts, favorable evaluation factors at some agencies.",
    soleSrcLimit: "N/A (set-aside only, no sole-source)",
    link: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/veteran-assistance-programs",
  });

  // HUBZone
  const isHubzoneEligible = answers.hubzone_location === "yes" && answers.hubzone_employees === "yes" &&
    smallEnough && answers.us_citizens === "yes" && answers.independently_owned === "yes";
  results.push({
    name: "HUBZone", code: "hubzone", eligible: isHubzoneEligible,
    reason: isHubzoneEligible
      ? "You appear to qualify for HUBZone certification."
      : answers.hubzone_location !== "yes" ? "Principal office must be in a designated HUBZone."
      : answers.hubzone_employees !== "yes" ? "At least 35% of employees must reside in a HUBZone."
      : "One or more requirements not met.",
    benefits: "10% price evaluation preference, set-aside and sole-source contracts, HUBZone joint ventures.",
    soleSrcLimit: "$4.5M (services) / $7M (manufacturing)",
    link: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program",
  });

  return results;
}

export default function CertificationAdvisorPage() {
  const { organization } = useDashboard();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CertResult[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const currentQ = QUESTIONS[step];
  const isLastStep = step === QUESTIONS.length - 1;

  const handleAnswer = (value: string) => {
    const updated = { ...answers, [currentQ.key]: value };
    setAnswers(updated);
    if (isLastStep) {
      setResults(evaluateCerts(updated));
    } else {
      setStep(step + 1);
    }
  };

  const restart = () => {
    setStep(0);
    setAnswers({});
    setResults(null);
    setShowAll(false);
  };

  const eligible = results?.filter(r => r.eligible) ?? [];
  const ineligible = results?.filter(r => !r.eligible) ?? [];
  const existingCerts = organization.certifications || [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-2 rounded-full bg-[#059669]" />
        <h1 className="ci-page-title">Certification Eligibility Advisor</h1>
      </div>
      <p className="text-[13px] text-[#64748b] mb-6">
        Answer 10 questions to discover which SBA certifications your business may qualify for. Certifications unlock set-aside contracts worth billions annually.
      </p>

      {existingCerts.length > 0 && !results && (
        <div className="ci-card p-4 mb-6 border-l-4 border-l-[#059669]">
          <div className="text-[11px] uppercase tracking-wide text-[#94a3b8] mb-1">Current Certifications</div>
          <div className="flex flex-wrap gap-2">
            {existingCerts.map((c: string) => (
              <span key={c} className="px-2 py-1 text-xs bg-[#ecfdf5] text-[#059669] rounded font-medium">{c}</span>
            ))}
          </div>
        </div>
      )}

      {!results ? (
        <div className="ci-card p-6">
          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] text-[#94a3b8]">Question {step + 1} of {QUESTIONS.length}</span>
            <span className="text-[11px] font-mono text-[#2563eb]">{Math.round(((step) / QUESTIONS.length) * 100)}%</span>
          </div>
          <div className="w-full bg-[#f1f5f9] rounded-full h-1.5 mb-6">
            <div className="bg-[#2563eb] h-1.5 rounded-full transition-all duration-300" style={{ width: `${(step / QUESTIONS.length) * 100}%` }} />
          </div>

          <h2 className="text-[16px] font-medium text-[#0f172a] mb-4">{currentQ.label}</h2>

          {currentQ.type === "yesno" ? (
            <div className="flex gap-3">
              <button onClick={() => handleAnswer("yes")} className="flex-1 py-3 px-4 text-sm font-medium border border-[#e5e7eb] rounded-lg hover:border-[#059669] hover:bg-[#ecfdf5] hover:text-[#059669] transition-all">Yes</button>
              <button onClick={() => handleAnswer("no")} className="flex-1 py-3 px-4 text-sm font-medium border border-[#e5e7eb] rounded-lg hover:border-[#dc2626] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-all">No</button>
              <button onClick={() => handleAnswer("unsure")} className="flex-1 py-3 px-4 text-sm font-medium border border-[#e5e7eb] rounded-lg hover:border-[#d97706] hover:bg-[#fffbeb] hover:text-[#d97706] transition-all text-[#94a3b8]">Unsure</button>
            </div>
          ) : (
            <div className="space-y-2">
              {currentQ.options?.map(opt => (
                <button key={opt.value} onClick={() => handleAnswer(opt.value)}
                  className="w-full text-left py-3 px-4 text-sm border border-[#e5e7eb] rounded-lg hover:border-[#2563eb] hover:bg-[#eff6ff] transition-all">
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="mt-4 text-xs text-[#94a3b8] hover:text-[#475569]">&larr; Back</button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="ci-card p-6 border-l-4 border-l-[#2563eb]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-semibold text-[#0f172a]">Your Eligibility Results</h2>
              <button onClick={restart} className="text-xs text-[#2563eb] hover:text-[#1d4ed8]">Retake Assessment</button>
            </div>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-3xl font-bold font-mono text-[#059669]">{eligible.length}</div>
              <div className="text-[13px] text-[#475569]">certifications you may qualify for out of {results.length} evaluated</div>
            </div>
            {eligible.length > 0 && (
              <div className="text-[12px] text-[#475569] bg-[#ecfdf5] rounded-lg p-3">
                Certifications can unlock sole-source contracts up to $4.5M-$7M and give you access to billions in annual set-aside spending. Each certification reduces competition significantly.
              </div>
            )}
          </div>

          {/* Eligible */}
          {eligible.length > 0 && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wide text-[#059669] font-medium mb-3">Likely Eligible</h3>
              <div className="space-y-3">
                {eligible.map(cert => (
                  <div key={cert.code} className="ci-card p-5 border-l-4 border-l-[#059669]">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[14px] font-semibold text-[#0f172a]">{cert.name}</h4>
                      <span className="px-2 py-1 text-[10px] font-medium bg-[#ecfdf5] text-[#059669] rounded">ELIGIBLE</span>
                    </div>
                    <p className="text-[12px] text-[#059669] mb-2">{cert.reason}</p>
                    <p className="text-[12px] text-[#475569] mb-2">{cert.benefits}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#94a3b8]">Sole-source limit: {cert.soleSrcLimit}</span>
                      <a href={cert.link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2563eb] hover:text-[#1d4ed8]">Apply at SBA.gov &rarr;</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ineligible */}
          {ineligible.length > 0 && (
            <div>
              <button onClick={() => setShowAll(!showAll)} className="text-[11px] uppercase tracking-wide text-[#94a3b8] font-medium mb-3 hover:text-[#475569]">
                {showAll ? "Hide" : "Show"} Not Eligible ({ineligible.length}) {showAll ? "▴" : "▾"}
              </button>
              {showAll && (
                <div className="space-y-2">
                  {ineligible.map(cert => (
                    <div key={cert.code} className="ci-card p-4 opacity-60">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-[13px] font-medium text-[#64748b]">{cert.name}</h4>
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-[#f1f5f9] text-[#94a3b8] rounded">NOT ELIGIBLE</span>
                      </div>
                      <p className="text-[11px] text-[#94a3b8]">{cert.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
