/**
 * Pure HTML/text renderer for the ops digest.
 *
 * (data: DigestData) → {html, text, subject}
 *
 * No async, no IO. Inline CSS only (Gmail strips <style>).  640px max width.
 *
 * See docs/architecture/pr4-digest-email-plan.md §4.
 */

import type {
  DigestData,
  HealthHeader,
  RenderResult,
  RollupStatus,
} from "./types";

const COLORS: Record<RollupStatus, string> = {
  green: "#16a34a",
  yellow: "#d97706",
  red: "#dc2626",
  error: "#dc2626",
  stale: "#64748b",
};

const STATUS_WORDS: Record<RollupStatus, string> = {
  green: "GREEN",
  yellow: "YELLOW",
  red: "RED",
  error: "ERROR",
  stale: "STALE",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(status: string): string {
  const c = (COLORS as Record<string, string>)[status] ?? "#64748b";
  return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:${c};color:#fff;font-size:11px;font-weight:600;text-transform:uppercase;">${esc(status)}</span>`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch {
    return iso;
  }
}

function ageMinutes(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 60000);
}

/* ===================== HTML ===================== */

function renderBannerHtml(h: HealthHeader): string {
  const color = COLORS[h.rollup];
  const word = STATUS_WORDS[h.rollup];
  const sub = h.stale
    ? "(stale data — no health run today)"
    : `${h.greenCount}/${h.totalCount} checks green${h.runId ? ` · run_id ${esc(h.runId.slice(0, 8))}` : ""}`;
  return `<div style="background:${color};color:white;padding:16px 20px;border-radius:8px;font-weight:600;font-size:18px;">
  System Health: ${word} — ${esc(h.date)}
  <div style="font-size:12px;font-weight:400;opacity:0.9;margin-top:4px;">${sub}</div>
</div>`;
}

function renderCriticalHtml(d: DigestData): string {
  const { alerts, reds, capped } = d.critical;
  if (!alerts.length && !reds.length) {
    return `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No critical items. All red checks clear; no unacked error/critical alerts in the last 7 days.</p>`;
  }
  const items: string[] = [];
  for (const r of reds) {
    items.push(
      `<li style="margin:4px 0;font-size:13px;">${statusBadge(r.status)} <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;">${esc(r.name)}</code> — metric ${r.metric ?? "—"} / threshold ${r.threshold ?? "—"}</li>`,
    );
  }
  for (const a of alerts) {
    items.push(
      `<li style="margin:4px 0;font-size:13px;">${statusBadge(a.severity)} <strong>${esc(a.source)}</strong> — ${esc(a.message)} <span style="color:#94a3b8;">(${esc(fmtTime(a.created_at))}, id=${a.id})</span></li>`,
    );
  }
  const more = capped ? `<li style="color:#94a3b8;font-size:12px;">…cap reached at 20; older alerts truncated.</li>` : "";
  return `<ul style="padding-left:20px;margin:8px 0 0;">${items.join("")}${more}</ul>`;
}

function renderScrapingHtml(d: DigestData): string {
  const { rows, totalRuns, totalOk, totalFail, totalOpps, totalMatches } = d.scraping;
  if (!rows.length) {
    return `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No scraper runs in the last 24h.</p>`;
  }
  const trs = rows
    .map((r) => {
      const failColor = r.fail > 0 ? "#dc2626" : "#0f172a";
      return `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${esc(r.source)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;">${r.runs}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;color:#16a34a;">${r.ok}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;color:${failColor};">${r.fail}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;">${r.opps}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;">${r.matches}</td>
</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
  <thead><tr style="background:#f1f5f9;text-align:left;">
    <th style="padding:6px 8px;">Source</th>
    <th style="padding:6px 8px;text-align:right;">Runs</th>
    <th style="padding:6px 8px;text-align:right;">OK</th>
    <th style="padding:6px 8px;text-align:right;">Fail</th>
    <th style="padding:6px 8px;text-align:right;">Opps</th>
    <th style="padding:6px 8px;text-align:right;">Matches</th>
  </tr></thead>
  <tbody>${trs}
  <tr style="background:#f8fafc;font-weight:600;">
    <td style="padding:6px 8px;">total</td>
    <td style="padding:6px 8px;text-align:right;font-family:Menlo,Consolas,monospace;">${totalRuns}</td>
    <td style="padding:6px 8px;text-align:right;font-family:Menlo,Consolas,monospace;">${totalOk}</td>
    <td style="padding:6px 8px;text-align:right;font-family:Menlo,Consolas,monospace;">${totalFail}</td>
    <td style="padding:6px 8px;text-align:right;font-family:Menlo,Consolas,monospace;">${totalOpps}</td>
    <td style="padding:6px 8px;text-align:right;font-family:Menlo,Consolas,monospace;">${totalMatches}</td>
  </tr>
  </tbody>
</table>`;
}

function renderCertsHtml(d: DigestData): string {
  if (!d.certs.length) {
    return `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No cert state available.</p>`;
  }
  const now = new Date(d.generatedAt);
  const trs = d.certs
    .map((c) => {
      const pct =
        c.universe === 0
          ? "—"
          : `${((c.cumulative / c.universe) * 100).toFixed(1)}%`;
      const universeStr = c.universe === 0 ? "No leads yet" : `${c.cumulative}/${c.universe} (${pct})`;
      const tickAge = ageMinutes(c.lastTickAt, now);
      const tickStr = tickAge === null ? "—" : `${tickAge}m ago`;
      return `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${esc(c.cert)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${esc(c.stage ?? "—")}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:Menlo,Consolas,monospace;">${tickStr}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;">${c.verifiedYesterday}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:Menlo,Consolas,monospace;">${esc(universeStr)}</td>
</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
  <thead><tr style="background:#f1f5f9;text-align:left;">
    <th style="padding:6px 8px;">Cert</th>
    <th style="padding:6px 8px;">Stage</th>
    <th style="padding:6px 8px;">Last tick</th>
    <th style="padding:6px 8px;text-align:right;">Verified yest.</th>
    <th style="padding:6px 8px;">Cumulative / Universe</th>
  </tr></thead>
  <tbody>${trs}</tbody>
</table>`;
}

function renderResourcesHtml(d: DigestData): string {
  if (!d.resources.length) {
    return `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No resource data.</p>`;
  }
  const items = d.resources
    .map(
      (r) =>
        `<li style="margin:4px 0;font-size:13px;">${statusBadge(r.status)} <strong>${esc(r.label)}:</strong> ${esc(r.value)}${r.detail ? ` <span style="color:#64748b;">(${esc(r.detail)})</span>` : ""}</li>`,
    )
    .join("");
  return `<ul style="padding-left:20px;margin:8px 0 0;">${items}</ul>`;
}

function renderSparklinesHtml(d: DigestData): string {
  if (!d.sparklines.length) {
    return `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No sparkline data.</p>`;
  }
  const maxLen = Math.max(...d.sparklines.map((s) => s.name.length));
  const lines = d.sparklines
    .map((s) => `${s.name.padEnd(maxLen + 2)}${s.chars}`)
    .join("\n");
  return `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.6;background:#f8fafc;padding:12px 16px;border-radius:6px;margin-top:8px;white-space:pre;">${esc(lines)}</pre>`;
}

function sectionHeaderHtml(title: string): string {
  return `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin:24px 0 8px;">${esc(title)}</h2>`;
}

function renderHtml(d: DigestData): string {
  const errs = d.errors.length
    ? `<div style="background:#fef3c7;border:1px solid #fbbf24;color:#78350f;padding:8px 12px;border-radius:6px;margin-top:16px;font-size:12px;">
  Section errors: ${d.errors.map((e) => `<code>${esc(e.section)}</code>: ${esc(e.error)}`).join("; ")}
</div>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
${renderBannerHtml(d.health)}

${sectionHeaderHtml("Critical items")}
${renderCriticalHtml(d)}

${sectionHeaderHtml("Yesterday's scraping")}
${renderScrapingHtml(d)}

${sectionHeaderHtml("Pipeline progress")}
${renderCertsHtml(d)}

${sectionHeaderHtml("Resources")}
${renderResourcesHtml(d)}

${sectionHeaderHtml("7-day trend")}
${renderSparklinesHtml(d)}
${errs}

<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
  <a href="${esc(d.links.vercel)}" style="color:#64748b;">Vercel</a> ·
  <a href="${esc(d.links.supabase)}" style="color:#64748b;">Supabase</a> ·
  <a href="${esc(d.links.instantly)}" style="color:#64748b;">Instantly</a> ·
  <a href="${esc(d.links.audit)}" style="color:#64748b;">/api/audit</a>${d.links.healthchecks ? ` · <a href="${esc(d.links.healthchecks)}" style="color:#64748b;">healthchecks.io</a>` : ""}
  <br>run_id: ${esc(d.runId)}
</div>
</div>`;
}

/* ===================== Text ===================== */

function renderText(d: DigestData): string {
  const lines: string[] = [];
  const h = d.health;
  lines.push(`System Health: ${STATUS_WORDS[h.rollup]} — ${h.date}`);
  if (h.stale) lines.push("(stale data — no health run today)");
  else lines.push(`${h.greenCount}/${h.totalCount} checks green${h.runId ? ` · run_id ${h.runId.slice(0, 8)}` : ""}`);
  lines.push("");

  lines.push("CRITICAL ITEMS");
  lines.push("--------------");
  if (!d.critical.alerts.length && !d.critical.reds.length) {
    lines.push("None. All clear.");
  } else {
    for (const r of d.critical.reds) {
      lines.push(`  [${r.status.toUpperCase()}] ${r.name} — metric ${r.metric ?? "—"} / threshold ${r.threshold ?? "—"}`);
    }
    for (const a of d.critical.alerts) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.source} — ${a.message} (${fmtTime(a.created_at)}, id=${a.id})`);
    }
    if (d.critical.capped) lines.push("  …cap reached at 20; older alerts truncated.");
  }
  lines.push("");

  lines.push("YESTERDAY'S SCRAPING");
  lines.push("--------------------");
  if (!d.scraping.rows.length) {
    lines.push("No scraper runs in the last 24h.");
  } else {
    lines.push("Source                 Runs   OK Fail  Opps  Matches");
    for (const r of d.scraping.rows) {
      lines.push(
        `${r.source.padEnd(22)} ${String(r.runs).padStart(4)} ${String(r.ok).padStart(4)} ${String(r.fail).padStart(4)} ${String(r.opps).padStart(5)}  ${String(r.matches).padStart(7)}`,
      );
    }
    lines.push(
      `${"total".padEnd(22)} ${String(d.scraping.totalRuns).padStart(4)} ${String(d.scraping.totalOk).padStart(4)} ${String(d.scraping.totalFail).padStart(4)} ${String(d.scraping.totalOpps).padStart(5)}  ${String(d.scraping.totalMatches).padStart(7)}`,
    );
  }
  lines.push("");

  lines.push("PIPELINE PROGRESS");
  lines.push("-----------------");
  if (!d.certs.length) {
    lines.push("No cert state available.");
  } else {
    const now = new Date(d.generatedAt);
    for (const c of d.certs) {
      const pct = c.universe === 0 ? "—" : `${((c.cumulative / c.universe) * 100).toFixed(1)}%`;
      const universeStr = c.universe === 0 ? "No leads yet" : `${c.cumulative}/${c.universe} (${pct})`;
      const tickAge = ageMinutes(c.lastTickAt, now);
      const tickStr = tickAge === null ? "—" : `${tickAge}m ago`;
      lines.push(`  ${c.cert.padEnd(8)} stage=${c.stage ?? "—"} tick=${tickStr} verified_yest=${c.verifiedYesterday} ${universeStr}`);
    }
  }
  lines.push("");

  lines.push("RESOURCES");
  lines.push("---------");
  for (const r of d.resources) {
    lines.push(`  [${r.status.toUpperCase()}] ${r.label}: ${r.value}`);
  }
  lines.push("");

  lines.push("7-DAY TREND");
  lines.push("-----------");
  if (d.sparklines.length) {
    const maxLen = Math.max(...d.sparklines.map((s) => s.name.length));
    for (const s of d.sparklines) {
      lines.push(`  ${s.name.padEnd(maxLen + 2)}${s.chars}`);
    }
  } else {
    lines.push("  (no data)");
  }
  lines.push("");

  if (d.errors.length) {
    lines.push("SECTION ERRORS");
    for (const e of d.errors) lines.push(`  ${e.section}: ${e.error}`);
    lines.push("");
  }

  lines.push("--");
  lines.push(`Vercel:    ${d.links.vercel}`);
  lines.push(`Supabase:  ${d.links.supabase}`);
  lines.push(`Instantly: ${d.links.instantly}`);
  lines.push(`Audit:     ${d.links.audit}`);
  if (d.links.healthchecks) lines.push(`Healthchecks: ${d.links.healthchecks}`);
  lines.push(`run_id: ${d.runId}`);

  return lines.join("\n");
}

/* ===================== Subject ===================== */

function renderSubject(d: DigestData): string {
  return `[ContractsIntel] Daily Digest — ${d.dateUtc} — ${d.health.rollup}`;
}

export function renderDigest(data: DigestData): RenderResult {
  return {
    html: renderHtml(data),
    text: renderText(data),
    subject: renderSubject(data),
  };
}
