"use client";

import { useEffect, useState } from "react";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("ci_cookie_consent")) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("ci_cookie_consent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("ci_cookie_consent", "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#e5e7eb] px-4 py-3 shadow-lg">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-[#475569]">
          We use essential cookies for authentication and session management.{" "}
          <a href="/privacy" className="text-[#2563eb] underline">
            Privacy Policy
          </a>
        </p>
        <div className="flex gap-2">
          <button
            onClick={decline}
            className="text-xs px-4 py-2 border border-[#e5e7eb] rounded-lg text-[#475569] hover:bg-[#f8fafc]"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="text-xs px-4 py-2 bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
