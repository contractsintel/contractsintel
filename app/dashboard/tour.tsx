"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { isDiscovery } from "@/lib/feature-gate";

interface TourStep {
  selector: string | null;
  title: string;
  description: string;
  buttonText?: string;
  belowButton?: string;
  skipForDiscovery?: boolean;
}

const ALL_STEPS: TourStep[] = [
  {
    selector: null,
    title: "Welcome to ContractsIntel",
    description:
      "Let's take a quick tour of your new platform. This will take about 2 minutes. You can skip at any time and restart the tour later from your Settings page.",
    buttonText: "Let's Go",
  },
  {
    selector: '[data-tour="stats-bar"]',
    title: "Your daily snapshot",
    description:
      "These numbers update every morning. They show how many new contract opportunities matched your certifications overnight, their total value, how many are closing soon, and your best match score today.",
  },
  {
    selector: '[data-tour="opportunity-card"]',
    title: "Your matched opportunities",
    description:
      "Every card is a real contract opportunity that matches your certifications and NAICS codes. You can see the agency, contract value, days until the deadline closes, and your match score. The higher the score, the better the fit for your business.",
  },
  {
    selector: '[data-tour="ai-recommendation"]',
    title: "AI-powered bid recommendations",
    description:
      "For every opportunity, our AI analyzes the competition, identifies the incumbent, and tells you whether to bid, monitor, or skip — with a clear explanation of why. This saves you from wasting time on contracts you can't win.",
  },
  {
    selector: '[data-tour="action-buttons"]',
    title: "Take action on opportunities",
    description:
      "Click 'Track' to keep an eye on an opportunity. Click 'Bid' when you decide to pursue it — this moves it to your Pipeline and, if you're on BD Pro, generates a proposal first draft. Click 'Skip' to remove it from your feed.",
  },
  {
    selector: '[data-tour="sidebar-pipeline"]',
    title: "Track your entire pipeline",
    description:
      "The Pipeline shows every opportunity you're tracking, organized by stage: Monitoring, Preparing Bid, Submitted, Won, and Lost. When you mark something as 'Won,' the platform automatically creates your delivery dashboard and past performance record.",
  },
  {
    selector: '[data-tour="sidebar-proposals"]',
    title: "AI writes your first draft",
    description:
      "When you mark an opportunity as 'Bidding,' come here to generate a proposal first draft. The AI reads the solicitation requirements and writes your Technical Approach, Past Performance narrative, and Executive Summary. A 30-hour writing task becomes 6 hours of review and polish.",
    skipForDiscovery: true,
  },
  {
    selector: '[data-tour="sidebar-compliance"]',
    title: "Never miss a deadline",
    description:
      "Your Compliance dashboard tracks every critical deadline — SAM.gov registration renewal, certification reviews, CMMC requirements, and FAR regulation changes. You get a health score from 0 to 100, and email alerts before anything is due. One missed deadline can cost you a contract. This makes sure that never happens.",
  },
  {
    selector: '[data-tour="sidebar-past-performance"]',
    title: "Build your performance library",
    description:
      "Every time you win a contract, a performance record is created automatically. Each month, you'll get a reminder to log what you delivered. When it's time to write a proposal, the AI generates ready-to-paste Past Performance Questionnaire narratives from your logged data.",
    skipForDiscovery: true,
  },
  {
    selector: '[data-tour="sidebar-contracts"]',
    title: "Manage delivery after you win",
    description:
      "When you win a contract, your delivery dashboard activates automatically. It tracks every deliverable deadline, reporting requirement, invoice, and option period. You get alerts before each deadline. If the government is late paying you, the system flags it and generates a Prompt Payment Act demand letter.",
    skipForDiscovery: true,
  },
  {
    selector: '[data-tour="sidebar-settings"]',
    title: "Sync deadlines to your calendar",
    description:
      "In Settings, you can connect your Google Calendar. Every deadline you track — bid responses, contract milestones, compliance dates — gets pushed to your calendar with reminders on your phone. Even if you forget to check the dashboard, your calendar won't let you miss anything.",
  },
  {
    selector: null,
    title: "You're all set!",
    description:
      "Your first real daily digest arrives tomorrow at 7am with opportunities matched to your exact certifications and NAICS codes. In the meantime, explore the sample data in your dashboard to see how everything works. If you need help, click the ? icon on any page or email us at support@contractsintel.com.",
    buttonText: "Go to Dashboard",
    belowButton: "You can restart this tour anytime from Settings.",
  },
];

export function ProductTour({ onComplete }: { onComplete?: () => void }) {
  const { organization, user } = useDashboard();
  const supabase = createClient();
  const discovery = isDiscovery(organization.plan);

  const steps = ALL_STEPS.filter((s) => !(s.skipForDiscovery && discovery));
  const totalSteps = steps.length;

  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const animFrameRef = useRef<number>(0);

  const step = steps[currentStep];

  const positionTooltip = useCallback(
    (rect: DOMRect | null) => {
      if (!rect) {
        setTooltipPos(null);
        return;
      }
      const tooltipW = 360;
      const tooltipH = 220;
      const padding = 16;

      let top = rect.bottom + padding;
      let left = rect.left + rect.width / 2 - tooltipW / 2;

      // If tooltip goes below viewport, show above
      if (top + tooltipH > window.innerHeight) {
        top = rect.top - tooltipH - padding;
      }
      // Clamp horizontal
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipW - padding));
      // Clamp vertical
      top = Math.max(padding, top);

      setTooltipPos({ top, left });
    },
    []
  );

  const updateSpotlight = useCallback(() => {
    if (!step?.selector) {
      setSpotlightRect(null);
      setTooltipPos(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);
      positionTooltip(rect);
    } else {
      setSpotlightRect(null);
      setTooltipPos(null);
    }
  }, [step, positionTooltip]);

  useEffect(() => {
    updateSpotlight();
    const handle = () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(updateSpotlight);
    };
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [updateSpotlight]);

  const completeTour = useCallback(async () => {
    localStorage.setItem("ci_tour_completed", "true");
    try {
      await supabase
        .from("user_preferences")
        .upsert(
          { user_id: user.id, tour_completed: true },
          { onConflict: "user_id" }
        );
    } catch {
      // non-critical
    }
    onComplete?.();
  }, [supabase, user.id, onComplete]);

  const handleNext = () => {
    if (currentStep >= totalSteps - 1) {
      completeTour();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleSkip = () => {
    completeTour();
  };

  const spotlightPad = 8;

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "auto" }}>
      {/* Overlay */}
      {spotlightRect ? (
        <div
          className="absolute transition-all duration-300 ease-in-out"
          style={{
            top: spotlightRect.top - spotlightPad,
            left: spotlightRect.left - spotlightPad,
            width: spotlightRect.width + spotlightPad * 2,
            height: spotlightRect.height + spotlightPad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute z-[10000] transition-all duration-300 ease-in-out"
        style={
          tooltipPos
            ? { top: tooltipPos.top, left: tooltipPos.left, maxWidth: 360 }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                maxWidth: 360,
              }
        }
      >
        <div
          className="bg-white border border-[#2563eb] p-6"
          style={{ maxWidth: 360 }}
        >
          {/* Step counter */}
          <p
            className="text-[11px] text-[#9ca3af] mb-3"
            style={{ fontFamily: "var(--font-geist-mono, monospace)" }}
          >
            Step {currentStep + 1} of {totalSteps}
          </p>

          {/* Title */}
          <h3 className="text-[16px] font-bold text-[#111827] mb-2">
            {step.title}
          </h3>

          {/* Description */}
          <p className="text-[14px] text-[#4b5563] leading-[1.6] mb-5">
            {step.description}
          </p>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="text-xs text-[#9ca3af] hover:text-[#4b5563] transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="bg-[#2563eb] text-white px-4 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
            >
              {step.buttonText ?? "Next"}
              {!step.buttonText && " \u2192"}
            </button>
          </div>

          {step.belowButton && (
            <p className="text-xs text-[#9ca3af] mt-3">{step.belowButton}</p>
          )}

          {/* Skip */}
          {currentStep < totalSteps - 1 && (
            <button
              onClick={handleSkip}
              className="text-xs text-[#9ca3af] hover:text-[#4b5563] transition-colors mt-3 block"
            >
              Skip Tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
