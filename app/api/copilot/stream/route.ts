import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G20: Conversational copilot streaming endpoint.
// POST { thread_id?: string, message: string }
// → text/event-stream of delta tokens, terminated by an `event: done` frame
//   carrying { thread_id, assistant_message_id }.
//
// Each turn is RLS-scoped: the user's row in `users` resolves the
// organization_id, and we inject a small grounding context (org name +
// recent matched opportunities) so the model has tenant data without us
// having to expose a tool-use loop in v1.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    let threadId: string | null = typeof body?.thread_id === "string" ? body.thread_id : null;
    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
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
        return NextResponse.json({ error: "Could not start thread" }, { status: 500 });
      }
      threadId = newThread.id;
    }

    // Persist the user turn before we start streaming.
    const { error: userMsgErr } = await supabase.from("copilot_messages").insert({
      thread_id: threadId,
      role: "user",
      content: message,
    });
    if (userMsgErr) {
      console.error("copilot user message insert error:", userMsgErr);
      return NextResponse.json({ error: "Could not save message" }, { status: 500 });
    }

    // Pull the recent thread history (RLS-scoped) for multi-turn coherence.
    const { data: history } = await supabase
      .from("copilot_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(40);

    // Tenant grounding: org name + handful of top-scoring matches so the
    // model can answer "what's my best opportunity right now?" type prompts
    // without us building a tool loop in v1.
    const { data: org } = await supabase
      .from("organizations")
      .select("name, naics_codes, certifications")
      .eq("id", userRow.organization_id)
      .single();

    const { data: matches } = await supabase
      .from("opportunity_matches")
      .select("match_score, opportunities(title, agency, response_deadline, estimated_value)")
      .eq("organization_id", userRow.organization_id)
      .order("match_score", { ascending: false })
      .limit(5);

    const groundingLines: string[] = [];
    if (org?.name) groundingLines.push(`Organization: ${org.name}`);
    if (org?.naics_codes?.length) groundingLines.push(`NAICS: ${org.naics_codes.join(", ")}`);
    if (org?.certifications?.length) groundingLines.push(`Certifications: ${org.certifications.join(", ")}`);
    if (matches?.length) {
      groundingLines.push("Top matches:");
      for (const m of matches) {
        const o: any = (m as any).opportunities;
        if (!o) continue;
        groundingLines.push(
          `- ${o.title} · ${o.agency ?? "?"} · score ${(m as any).match_score ?? "?"}` +
            (o.estimated_value ? ` · $${Number(o.estimated_value).toLocaleString()}` : "") +
            (o.response_deadline ? ` · due ${new Date(o.response_deadline).toLocaleDateString()}` : ""),
        );
      }
    }

    const systemPrompt = `You are the ContractsIntel copilot — a concise assistant for federal contracting teams. Help the user understand their pipeline, prep proposals, evaluate opportunities, and navigate compliance. Stay grounded in the tenant context below; if the user asks about something outside it, answer from general knowledge but say so. Keep replies tight and skim-friendly.

Platform capabilities you can guide users to:
- Proposal Pink-Team Review: AI scores draft proposals against evaluation criteria (Proposals page)
- Proposal Outline Generator: builds annotated outlines from RFP shred data (Proposals page)
- RFP Document Chat: upload an RFP and ask questions — purple chat button in bottom-right
- Capability Statement PDF: one-click PDF export from Past Performance > Capability page
- Market Intelligence: USASpending spending data by NAICS — Analytics page, Market Intel tab
- Slack/Teams Webhooks: push opportunity alerts to chat platforms — Settings page

Tenant context:
${groundingLines.join("\n") || "(no grounding data available)"}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
    }
    const client = new Anthropic({ apiKey });

    // Build Anthropic messages from thread history. Drop any leading
    // assistant turns and coalesce sequential same-role messages.
    const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const m of history ?? []) {
      if (m.role === "system") continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      if (apiMessages.length === 0 && role !== "user") continue;
      const last = apiMessages[apiMessages.length - 1];
      if (last && last.role === role) {
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

    const stream = new ReadableStream({
      async start(controller) {
        let assembled = "";
        try {
          const llmStream = await client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: systemPrompt,
            messages: apiMessages,
          });

          for await (const event of llmStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const chunk = event.delta.text;
              assembled += chunk;
              controller.enqueue(
                encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`),
              );
            }
          }

          // Persist assistant turn (best-effort; do not fail the stream if insert errors).
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
        } catch (err: any) {
          console.error("copilot stream error:", err);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: err?.message ?? "Stream failed" })}\n\n`,
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
  } catch (err: any) {
    console.error("copilot route error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
