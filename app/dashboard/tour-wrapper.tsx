"use client";

import { useState, useEffect } from "react";
import { useDashboard } from "./context";
import { ProductTour } from "./tour";

export function TourWrapper() {
  const { user } = useDashboard();
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const tourCompleted = localStorage.getItem("ci_tour_completed");
    if (!tourCompleted) {
      // Small delay to let the page render first
      const timer = setTimeout(() => setShowTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, [user.id]);

  if (!showTour) return null;

  return <ProductTour onComplete={() => setShowTour(false)} />;
}
