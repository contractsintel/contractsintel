import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ContractsIntel — Government Contract Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 28,
              fontWeight: 700,
              marginRight: 16,
            }}
          >
            CI
          </div>
          <span style={{ color: "white", fontSize: 36, fontWeight: 600 }}>
            ContractsIntel
          </span>
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontSize: 48,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 900,
            marginBottom: 24,
          }}
        >
          Find, Win, and Manage Government Contracts
        </div>
        <div
          style={{
            color: "#94a3b8",
            fontSize: 24,
            textAlign: "center",
            maxWidth: 700,
            marginBottom: 40,
          }}
        >
          AI-powered contract intelligence for certified government contractors
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          {[
            { label: "$700B", sub: "Annual contracts" },
            { label: "55,000+", sub: "Federal, state & local opportunities" },
            { label: "22", sub: "Integrated products" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "16px 32px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span
                style={{ color: "#60a5fa", fontSize: 32, fontWeight: 700 }}
              >
                {stat.label}
              </span>
              <span style={{ color: "#94a3b8", fontSize: 16 }}>
                {stat.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
