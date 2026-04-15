import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G20 v2: Conversational copilot with TOOL USE.
//
// The copilot can now actively query the database to answer user questions
// instead of only seeing the top 5 matches injected at prompt time.
//
// Tools available to the model:
//   1. search_opportunities — full-text search across all active opportunities
//   2. get_my_pipeline      — list user's tracked/bidding/skipped matches
//   3. get_opportunity_detail — full details for one opportunity by ID
//   4. get_market_stats      — aggregate stats for a NAICS code
//   5. search_by_agency      — find opportunities by agency name
//
// The model decides which tools to call based on the user's question,
// executes them against the database, and synthesizes a response.

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_opportunities",
    description:
      "Search all active government contract opportunities by keywords. Use this when the user asks about specific types of contracts, industries, or topics. Returns up to 20 results with title, agency, NAICS, value, deadline, and source.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search keywords (e.g. 'cybersecurity', 'construction renovation', 'IT support services')",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 15, max 30)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_my_pipeline",
    description:
      "Get the user's current opportunity pipeline — their matched, tracked, bidding, and skipped opportunities. Use this when the user asks about 'my matches', 'my pipeline', 'what should I bid on', 'what's in my queue', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        status_filter: {
          type: "string",
          enum: ["all", "new", "tracking", "bidding", "skipped"],
          description: "Filter by pipeline status (default: all)",
        },
        min_score: {
          type: "number",
          description: "Minimum match score to include (0-100, default 0)",
        },
        limit: {
          type: "number",
          description: "Max results (default 20, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_opportunity_detail",
    description:
      "Get full details for a specific opportunity by its title (partial match). Use when the user asks about a specific contract or wants more info on something mentioned earlier.",
    input_schema: {
      type: "object" as const,
      properties: {
        title_search: {
          type: "string",
          description: "Part of the opportunity title to search for",
        },
      },
      required: ["title_search"],
    },
  },
  {
    name: "get_market_stats",
    description:
      "Get aggregate market statistics: total active opportunities, breakdown by source, top agencies, average values. Use when the user asks about market size, how many contracts are available, or general platform stats.",
    input_schema: {
      type: "object" as const,
      properties: {
        naics_code: {
          type: "string",
          description:
            "Optional NAICS code to filter stats (e.g. '541512'). Omit for overall stats.",
        },
      },
      required: [],
    },
  },
  {
    name: "search_by_agency",
    description:
      "Find active opportunities from a specific government agency. Use when the user asks about contracts from DoD, VA, NASA, GSA, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        agency: {
          type: "string",
          description:
            "Agency name or partial name (e.g. 'Department of Defense', 'VA', 'NASA')",
        },
        limit: {
          type: "number",
          description: "Max results (default 15, max 30)",
        },
      },
      required: ["agency"],
    },
  },
];

// Execute a tool call against the database
async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  orgId: string,
): Promise<string> {
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  switch (toolName) {
    case "search_opportunities": {
      const query = String(toolInput.query || "");
      const limit = Math.min(Number(toolInput.limit) || 15, 30);

      const COPILOT_COLS = "id, title, agency, naics_code, estimated_value, value_estimate, response_deadline, source, set_aside_type, solicitation_number, description, place_of_performance, contract_type";
      // Use textSearch for keyword matching to leverage GIN index
      const tsQuery = query
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .slice(0, 5)
        .join(" & ");
      const now = new Date().toISOString();
      let q = supabaseAdmin
        .from("opportunities")
        .select(COPILOT_COLS)
        .or(`response_deadline.is.null,response_deadline.gte.${now}`)
        .order("response_deadline", { ascending: true, nullsFirst: false })
        .limit(limit);

      // Use textSearch when available, fall back to ilike for short queries
      if (tsQuery) {
        q = q.textSearch("title_description_tsv", tsQuery, { type: "plain" });
      }

      const { data, error } = await q;
      if (error) return `Search error: ${error.message}`;
      if (!data || data.length === 0)
        return `No active opportunities found matching "${query}". Try broader keywords.`;

      return data
        .map((o, i) => {
          const val = o.estimated_value || o.value_estimate;
          return `${i + 1}. ${o.title}\n   Agency: ${o.agency || "N/A"} | NAICS: ${o.naics_code || "N/A"} | Value: ${val ? `$${Number(val).toLocaleString()}` : "Not specified"}\n   Deadline: ${o.response_deadline ? new Date(o.response_deadline).toLocaleDateString() : "TBD"} | Source: ${o.source || "N/A"} | Set-aside: ${o.set_aside_type || "Full & Open"}\n   Sol#: ${o.solicitation_number || "N/A"}`;
        })
        .join("\n\n");
    }

    case "get_my_pipeline": {
      const statusFilter = String(toolInput.status_filter || "all");
      const minScore = Number(toolInput.min_score) || 0;
      const limit = Math.min(Number(toolInput.limit) || 20, 50);

      let q = supabaseAdmin
        .from("opportunity_matches")
        .select(
          "match_score, bid_recommendation, user_status, user_notes, recommendation_reasoning, opportunities(id, title, agency, estimated_value, value_estimate, response_deadline, set_aside_type)",
        )
        .eq("organization_id", orgId)
        .gte("match_score", minScore)
        .order("match_score", { ascending: false })
        .limit(limit);

      if (statusFilter !== "all") {
        q = q.eq("user_status", statusFilter);
      }

      const { data, error } = await q;
      if (error) return `Pipeline query error: ${error.message}`;
      // Filter out past-deadline opportunities (keep won/lost)
      const pipeNow = new Date().toISOString();
      const KEEP = new Set(["won", "lost", "awarded"]);
      const activeData = (data ?? []).filter((m: Record<string, any>) => {
        if (KEEP.has(m.user_status)) return true;
        const dl = (m as Record<string, any>).opportunities?.response_deadline;
        return !dl || dl >= pipeNow;
      });
      if (activeData.length === 0)
        return statusFilter !== "all"
          ? `No opportunities with status "${statusFilter}" in your pipeline. Try a different filter or check "all".`
          : "Your pipeline is empty. Run matching from the dashboard to populate it.";

      const summary = {
        total: activeData.length,
        byStatus: {} as Record<string, number>,
        avgScore: 0,
      };
      let scoreSum = 0;
      activeData.forEach((m: Record<string, any>) => {
        const s = m.user_status || "new";
        summary.byStatus[s] = (summary.byStatus[s] || 0) + 1;
        scoreSum += m.match_score || 0;
      });
      summary.avgScore = Math.round(scoreSum / activeData.length);

      const statusLine = Object.entries(summary.byStatus)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      let result = `Pipeline Summary: ${summary.total} opportunities (${statusLine}) | Avg score: ${summary.avgScore}\n\n`;

      result += activeData
        .slice(0, 25)
        .map((m: Record<string, any>, i: number) => {
          const o = m.opportunities;
          if (!o) return `${i + 1}. [opportunity data unavailable]`;
          const val = o.estimated_value || o.value_estimate;
          return `${i + 1}. [Score ${m.match_score}] ${o.title}\n   Agency: ${o.agency || "N/A"} | Status: ${m.user_status || "new"} | Rec: ${m.bid_recommendation || "N/A"}\n   Value: ${val ? `$${Number(val).toLocaleString()}` : "N/A"} | Deadline: ${o.response_deadline ? new Date(o.response_deadline).toLocaleDateString() : "TBD"}\n   Why: ${(m.recommendation_reasoning || "").slice(0, 150)}`;
        })
        .join("\n\n");

      return result;
    }

    case "get_opportunity_detail": {
      const titleSearch = String(toolInput.title_search || "");
      const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, agency, naics_code, solicitation_number, estimated_value, value_estimate, set_aside_type, response_deadline, posted_date, source, place_of_performance, contract_type, description, full_description")
        .textSearch("title_description_tsv", titleSearch.split(/\s+/).join(" & "), { type: "plain" })
        .limit(3);

      if (error) return `Query error: ${error.message}`;
      if (!data || data.length === 0)
        return `No opportunities found matching "${titleSearch}".`;

      return data
        .map((o) => {
          const val = o.estimated_value || o.value_estimate;
          return `Title: ${o.title}
Agency: ${o.agency || "N/A"}
NAICS: ${o.naics_code || "N/A"}
Solicitation#: ${o.solicitation_number || "N/A"}
Value: ${val ? `$${Number(val).toLocaleString()}` : "Not specified"}
Set-aside: ${o.set_aside_type || "Full & Open"}
Deadline: ${o.response_deadline ? new Date(o.response_deadline).toLocaleDateString() : "TBD"}
Posted: ${o.posted_date ? new Date(o.posted_date).toLocaleDateString() : "N/A"}
Source: ${o.source || "N/A"}
Location: ${o.place_of_performance || "N/A"}
Contract Type: ${o.contract_type || "N/A"}
Description: ${(o.description || o.full_description || "No description available").slice(0, 800)}`;
        })
        .join("\n\n---\n\n");
    }

    case "get_market_stats": {
      const naicsCode = toolInput.naics_code
        ? String(toolInput.naics_code)
        : null;

      // Total active count — use estimated for speed on large tables
      let countQ = supabaseAdmin
        .from("opportunities")
        .select("id", { count: "estimated", head: true });
      if (naicsCode) countQ = countQ.eq("naics_code", naicsCode);
      const { count: totalActive } = await countQ;

      // By source
      const { data: bySource } = await supabaseAdmin.rpc("get_source_counts");

      // Top agencies — use RPC or limited query to avoid fetching 2000 rows
      let agencyQ = supabaseAdmin
        .from("opportunities")
        .select("agency")
        .not("agency", "is", null)
        .limit(500);
      if (naicsCode) agencyQ = agencyQ.eq("naics_code", naicsCode);
      const { data: agencyData } = await agencyQ;

      const agencyCounts: Record<string, number> = {};
      (agencyData || []).forEach((r: Record<string, any>) => {
        if (r.agency) agencyCounts[r.agency] = (agencyCounts[r.agency] || 0) + 1;
      });
      const topAgencies = Object.entries(agencyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      let result = `Market Overview${naicsCode ? ` (NAICS ${naicsCode})` : ""}:\n`;
      result += `Total active opportunities: ${(totalActive || 0).toLocaleString()}\n\n`;

      if (bySource && !naicsCode) {
        result += `By source:\n`;
        // bySource might be an array of {source, count} or might fail — handle gracefully
        if (Array.isArray(bySource)) {
          bySource.forEach((r: Record<string, any>) => {
            result += `  ${r.source || "unknown"}: ${r.count}\n`;
          });
        }
      }

      result += `\nTop agencies:\n`;
      topAgencies.forEach(([name, count], i) => {
        result += `  ${i + 1}. ${name} (${count} opportunities)\n`;
      });

      return result;
    }

    case "search_by_agency": {
      const agency = String(toolInput.agency || "");
      const limit = Math.min(Number(toolInput.limit) || 15, 30);

      const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, agency, naics_code, estimated_value, value_estimate, response_deadline, solicitation_number, source, set_aside_type")
        .ilike("agency", `%${agency}%`)
        .order("response_deadline", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (error) return `Agency search error: ${error.message}`;
      if (!data || data.length === 0)
        return `No active opportunities found from agency matching "${agency}". Try a different name (e.g. "Defense" instead of "DoD").`;

      return data
        .map((o, i) => {
          const val = o.estimated_value || o.value_estimate;
          return `${i + 1}. ${o.title}\n   Agency: ${o.agency} | NAICS: ${o.naics_code || "N/A"} | Value: ${val ? `$${Number(val).toLocaleString()}` : "N/A"}\n   Deadline: ${o.response_deadline ? new Date(o.response_deadline).toLocaleDateString() : "TBD"} | Sol#: ${o.solicitation_number || "N/A"}`;
        })
        .join("\n\n");
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 },
      );
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("id, organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const message =
      typeof body?.message === "string" ? body.message.trim() : "";
    let threadId: string | null =
      typeof body?.thread_id === "string" ? body.thread_id : null;
    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json(
        { error: "Message too long" },
        { status: 400 },
      );
    }

    // Create thread on first turn.
    if (!threadId) {
      const { data: newThread, error: threadErr } = await supabase
        .from("copilot_threads")
        .insert({
          organization_id: userRow.organization_id,
          user_id: userRow.id,
          title: message.slice(0, 80),
        })
        .select("id")
        .single();
      if (threadErr || !newThread) {
        console.error("copilot thread create error:", threadErr);
        return NextResponse.json(
          { error: "Could not start thread" },
          { status: 500 },
        );
      }
      threadId = newThread.id;
    }

    // Persist the user turn before we start streaming.
    const { error: userMsgErr } = await supabase
      .from("copilot_messages")
      .insert({
        thread_id: threadId,
        role: "user",
        content: message,
      });
    if (userMsgErr) {
      console.error("copilot user message insert error:", userMsgErr);
      return NextResponse.json(
        { error: "Could not save message" },
        { status: 500 },
      );
    }

    // Pull the recent thread history for multi-turn coherence.
    const { data: history } = await supabase
      .from("copilot_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(40);

    // Tenant grounding context
    const { data: org } = await supabase
      .from("organizations")
      .select("name, naics_codes, certifications, keywords, service_states")
      .eq("id", userRow.organization_id)
      .single();

    // Quick stats for context
    const { count: matchCount } = await supabase
      .from("opportunity_matches")
      .select("id", { count: "estimated", head: true })
      .eq("organization_id", userRow.organization_id);

    const { data: topMatches } = await supabase
      .from("opportunity_matches")
      .select(
        "match_score, bid_recommendation, opportunities(id, title, agency, estimated_value, response_deadline)",
      )
      .eq("organization_id", userRow.organization_id)
      .order("match_score", { ascending: false })
      .limit(5);

    const groundingLines: string[] = [];
    if (org?.name) groundingLines.push(`Organization: ${org.name}`);
    if (org?.naics_codes?.length)
      groundingLines.push(`NAICS codes: ${org.naics_codes.join(", ")}`);
    if (org?.certifications?.length)
      groundingLines.push(
        `Certifications: ${org.certifications.join(", ")}`,
      );
    if (org?.keywords?.length)
      groundingLines.push(`Keywords: ${org.keywords.join(", ")}`);
    if (org?.service_states?.length)
      groundingLines.push(
        `Service states: ${org.service_states.join(", ")}`,
      );
    groundingLines.push(`Total matched opportunities: ${matchCount || 0}`);

    if (topMatches?.length) {
      groundingLines.push("\nTop 5 matches:");
      for (const m of topMatches) {
        const mRec = m as Record<string, any>;
        const o = mRec.opportunities as Record<string, any> | undefined;
        if (!o) continue;
        groundingLines.push(
          `  - [Score ${mRec.match_score}] ${o.title} · ${o.agency ?? "?"} ${o.estimated_value ? `· $${Number(o.estimated_value).toLocaleString()}` : ""} ${o.response_deadline ? `· due ${new Date(String(o.response_deadline)).toLocaleDateString()}` : ""}`,
        );
      }
    }

    const systemPrompt = `You are Bid Assist, the ContractsIntel AI assistant — a powerful AI assistant for federal government contracting teams. You have tools that let you search and query a database of 77,000+ active government contract opportunities from SAM.gov, USASpending.gov, and other federal sources.

CAPABILITIES:
- Search all active opportunities by keyword, agency, or NAICS code
- Show the user's matched pipeline with scores and recommendations
- Get full details on any specific opportunity
- Provide market statistics and trends
- Help with proposal strategy, compliance, and bid/no-bid decisions

BEHAVIOR:
- Use your tools proactively. If the user asks "what cybersecurity contracts are available?" — search for them, don't just describe the feature.
- When showing opportunities, highlight key details: value, deadline, set-aside, agency.
- If a deadline is within 14 days, flag it as urgent.
- Give actionable advice: recommend bid/no-bid based on the user's profile.
- Be concise. Use bullet points and tables when helpful. No filler.
- If data isn't available, say so directly — don't fabricate.

Platform features you can guide users to:
- Dashboard: View and filter matched opportunities, apply pipeline actions (Bid/Track/Skip)
- Proposals page: Generate AI proposals, run Proposal Scorer reviews, export to DOCX
- RFP Decoder: Upload RFP text to extract evaluation criteria, Section L/M, deadlines
- DocIntel (purple button): Upload RFP text and ask questions about it
- Spend Lens (Analytics > Spend Lens): USASpending data by NAICS
- Settings: Update company profile, NAICS codes, certifications

Tenant context (this user's organization):
${groundingLines.join("\n") || "(no grounding data available)"}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 },
      );
    }
    const client = new Anthropic({ apiKey });

    // Build messages from thread history
    const apiMessages: Array<{
      role: "user" | "assistant";
      content: string | Anthropic.ContentBlockParam[];
    }> = [];
    for (const m of history ?? []) {
      if (m.role === "system") continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      if (apiMessages.length === 0 && role !== "user") continue;
      const last = apiMessages[apiMessages.length - 1];
      if (last && last.role === role && typeof last.content === "string") {
        last.content += "\n" + m.content;
      } else {
        apiMessages.push({ role, content: m.content });
      }
    }
    if (apiMessages.length === 0) {
      apiMessages.push({ role: "user", content: message });
    }

    const encoder = new TextEncoder();
    const finalThreadId = threadId;
    const orgId = userRow.organization_id;

    const stream = new ReadableStream({
      async start(controller) {
        let assembled = "";
        try {
          // Tool-use loop: keep calling the model until it produces a final text response
          let currentMessages = [...apiMessages];
          let maxIterations = 5; // Safety limit on tool-use rounds

          while (maxIterations > 0) {
            maxIterations--;

            const response = await client.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 1536,
              system: systemPrompt,
              tools: TOOLS,
              messages: currentMessages as Anthropic.MessageParam[],
            });

            // Check if the model wants to use tools
            const toolUseBlocks = response.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
            );
            const textBlocks = response.content.filter(
              (b): b is Anthropic.TextBlock => b.type === "text",
            );

            // If there are text blocks, stream them to the client
            for (const block of textBlocks) {
              if (block.text) {
                assembled += block.text;
                controller.enqueue(
                  encoder.encode(
                    `event: delta\ndata: ${JSON.stringify({ text: block.text })}\n\n`,
                  ),
                );
              }
            }

            // If no tool use, we're done
            if (toolUseBlocks.length === 0) {
              break;
            }

            // Send a status message so the user sees activity
            const toolNames = toolUseBlocks
              .map((t) => t.name.replace(/_/g, " "))
              .join(", ");
            const statusMsg = `\n\n*Searching: ${toolNames}...*\n\n`;
            assembled += statusMsg;
            controller.enqueue(
              encoder.encode(
                `event: delta\ndata: ${JSON.stringify({ text: statusMsg })}\n\n`,
              ),
            );

            // Execute all tool calls
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const toolBlock of toolUseBlocks) {
              const result = await executeTool(
                toolBlock.name,
                toolBlock.input as Record<string, any>,
                orgId,
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolBlock.id,
                content: result,
              });
            }

            // Add assistant response + tool results to message history and loop
            currentMessages = [
              ...currentMessages,
              { role: "assistant" as const, content: response.content },
              { role: "user" as const, content: toolResults },
            ];
          }

          // Persist assistant turn
          let assistantMessageId: string | null = null;
          try {
            const { data: inserted } = await supabase
              .from("copilot_messages")
              .insert({
                thread_id: finalThreadId,
                role: "assistant",
                content: assembled,
              })
              .select("id")
              .single();
            assistantMessageId = inserted?.id ?? null;
            await supabase
              .from("copilot_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", finalThreadId);
          } catch (err) {
            console.error("copilot assistant persist error:", err);
          }

          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                thread_id: finalThreadId,
                assistant_message_id: assistantMessageId,
              })}\n\n`,
            ),
          );
        } catch (err: unknown) {
          console.error("copilot stream error:", err);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: err instanceof Error ? err.message : "Stream failed",
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    console.error("copilot route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
