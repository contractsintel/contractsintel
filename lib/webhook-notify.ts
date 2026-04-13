// Slack & Teams webhook notification helpers for ContractsIntel

export interface SlackMessage {
  blocks: Record<string, any>[];
  text?: string; // fallback
}

export interface TeamsMessage {
  type: "message";
  attachments: {
    contentType: "application/vnd.microsoft.card.adaptive";
    content: Record<string, any>;
  }[];
}

export interface MatchData {
  title: string;
  agency: string;
  value: string;
  deadline: string;
  matchScore: number;
  bidRecommendation: "bid" | "monitor" | "skip";
  opportunityId: string;
}

const APP_URL = "https://contractsintel.com";

function recColor(rec: string): string {
  if (rec === "bid") return "#059669";
  if (rec === "monitor") return "#d97706";
  return "#ef4444";
}

function recLabel(rec: string): string {
  if (rec === "bid") return "BID";
  if (rec === "monitor") return "MONITOR";
  return "SKIP";
}

// ── Slack ───────────────────────────────────────────────────────────────────

export async function sendSlackNotification(
  webhookUrl: string,
  payload: SlackMessage
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Slack responded ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Slack webhook" };
  }
}

function buildSlackOpportunityAlert(match: MatchData): SlackMessage {
  const color = recColor(match.bidRecommendation);
  const label = recLabel(match.bidRecommendation);
  const url = `${APP_URL}/dashboard/opportunity/${match.opportunityId}`;

  return {
    text: `New opportunity: ${match.title} (Score: ${match.matchScore})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${label}: ${match.title}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Agency*\n${match.agency}` },
          { type: "mrkdwn", text: `*Match Score*\n${match.matchScore}/100` },
          { type: "mrkdwn", text: `*Estimated Value*\n${match.value}` },
          { type: "mrkdwn", text: `*Deadline*\n${match.deadline}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Recommendation: *${label}*` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View in ContractsIntel" },
            url,
            style: match.bidRecommendation === "bid" ? "primary" : undefined,
          },
        ],
      },
    ],
  };
}

function buildSlackDigestSummary(
  count: number,
  topTitle: string,
  topScore: number
): SlackMessage {
  return {
    text: `${count} new matches today. Top: ${topTitle} (score: ${topScore})`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*ContractsIntel Daily Digest*\n${count} new matches today.\n\nTop match: *${topTitle}* (score: ${topScore})`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View All Matches" },
            url: `${APP_URL}/dashboard`,
            style: "primary",
          },
        ],
      },
    ],
  };
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function sendTeamsNotification(
  webhookUrl: string,
  payload: TeamsMessage
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Teams responded ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Teams webhook" };
  }
}

function buildTeamsOpportunityAlert(match: MatchData): TeamsMessage {
  const color = recColor(match.bidRecommendation);
  const label = recLabel(match.bidRecommendation);
  const url = `${APP_URL}/dashboard/opportunity/${match.opportunityId}`;

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "Container",
              style: "emphasis",
              items: [
                {
                  type: "TextBlock",
                  text: `${label}: ${match.title}`,
                  weight: "Bolder",
                  size: "Medium",
                  color: match.bidRecommendation === "bid" ? "Good" : match.bidRecommendation === "monitor" ? "Warning" : "Attention",
                },
              ],
            },
            {
              type: "ColumnSet",
              columns: [
                {
                  type: "Column",
                  width: "stretch",
                  items: [
                    { type: "TextBlock", text: "Agency", weight: "Bolder", size: "Small" },
                    { type: "TextBlock", text: match.agency, wrap: true },
                  ],
                },
                {
                  type: "Column",
                  width: "auto",
                  items: [
                    { type: "TextBlock", text: "Score", weight: "Bolder", size: "Small" },
                    { type: "TextBlock", text: `${match.matchScore}/100` },
                  ],
                },
                {
                  type: "Column",
                  width: "auto",
                  items: [
                    { type: "TextBlock", text: "Value", weight: "Bolder", size: "Small" },
                    { type: "TextBlock", text: match.value },
                  ],
                },
                {
                  type: "Column",
                  width: "auto",
                  items: [
                    { type: "TextBlock", text: "Deadline", weight: "Bolder", size: "Small" },
                    { type: "TextBlock", text: match.deadline },
                  ],
                },
              ],
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View in ContractsIntel",
              url,
            },
          ],
        },
      },
    ],
  };
}

function buildTeamsDigestSummary(
  count: number,
  topTitle: string,
  topScore: number
): TeamsMessage {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: "ContractsIntel Daily Digest",
              weight: "Bolder",
              size: "Medium",
            },
            {
              type: "TextBlock",
              text: `${count} new matches today.`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `Top match: **${topTitle}** (score: ${topScore})`,
              wrap: true,
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View All Matches",
              url: `${APP_URL}/dashboard`,
            },
          ],
        },
      },
    ],
  };
}

// ── Unified helpers ─────────────────────────────────────────────────────────

export async function sendOpportunityAlert(
  webhookUrl: string,
  platform: string,
  match: MatchData
): Promise<{ ok: boolean; error?: string }> {
  if (platform === "teams") {
    return sendTeamsNotification(webhookUrl, buildTeamsOpportunityAlert(match));
  }
  return sendSlackNotification(webhookUrl, buildSlackOpportunityAlert(match));
}

export async function sendDigestSummary(
  webhookUrl: string,
  platform: string,
  count: number,
  topTitle: string,
  topScore: number
): Promise<{ ok: boolean; error?: string }> {
  if (platform === "teams") {
    return sendTeamsNotification(
      webhookUrl,
      buildTeamsDigestSummary(count, topTitle, topScore)
    );
  }
  return sendSlackNotification(
    webhookUrl,
    buildSlackDigestSummary(count, topTitle, topScore)
  );
}

// ── Test message ────────────────────────────────────────────────────────────

export function buildSlackTestMessage(): SlackMessage {
  return {
    text: "ContractsIntel webhook connected successfully!",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*ContractsIntel* webhook connected successfully!\nYou will receive opportunity alerts and daily digest summaries here.",
        },
      },
    ],
  };
}

export function buildTeamsTestMessage(): TeamsMessage {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: "ContractsIntel webhook connected successfully!",
              weight: "Bolder",
              size: "Medium",
            },
            {
              type: "TextBlock",
              text: "You will receive opportunity alerts and daily digest summaries here.",
              wrap: true,
            },
          ],
        },
      },
    ],
  };
}
