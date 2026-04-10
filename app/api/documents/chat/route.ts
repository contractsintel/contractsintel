import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCUMENT_LENGTH = 100_000;

// Document chat endpoint for RFP/solicitation analysis.
// POST { document_text: string, question: string, thread_id?: string }
// → text/event-stream of delta tokens, terminated by an `event: done` frame
//   carrying { thread_id }.
//
// Unlike the copilot, this endpoint does NOT persist messages to the database.
// The document text is sent as context alongside the user question, and the
// model is instructed to answer as an RFP analyst.
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
    const documentText =
      typeof body?.document_text === "string" ? body.document_text : "";
    const question =
      typeof body?.question === "string" ? body.question.trim() : "";
    const threadId =
      typeof body?.thread_id === "string" ? body.thread_id : null;

    if (!documentText) {
      return NextResponse.json(
        { error: "Missing document_text" },
        { status: 400 },
      );
    }
    if (!question) {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 },
      );
    }
    if (documentText.length > MAX_DOCUMENT_LENGTH) {
      return NextResponse.json(
        {
          error: `Document too long (${documentText.length.toLocaleString()} chars). Maximum is ${MAX_DOCUMENT_LENGTH.toLocaleString()}.`,
        },
        { status: 400 },
      );
    }
    if (question.length > 4000) {
      return NextResponse.json(
        { error: "Question too long" },
        { status: 400 },
      );
    }

    const systemPrompt = `You are an RFP/solicitation analyst for federal government contractors. You have been given a document to analyze. Answer questions about this document accurately, citing specific sections when possible. Be concise and practical.

<document>
${documentText}
</document>`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 },
      );
    }
    const client = new Anthropic({ apiKey });

    // Build messages array. If a thread_id was provided, the client is
    // expected to send the full conversation history in subsequent calls
    // (kept client-side for document chat to avoid storing large doc blobs).
    const apiMessages: Array<{ role: "user" | "assistant"; content: string }> =
      [];

    // Include previous turns if the client sends them.
    if (Array.isArray(body?.history)) {
      for (const m of body.history) {
        if (
          m &&
          typeof m.content === "string" &&
          (m.role === "user" || m.role === "assistant")
        ) {
          const last = apiMessages[apiMessages.length - 1];
          if (last && last.role === m.role) {
            last.content += "\n" + m.content;
          } else {
            apiMessages.push({ role: m.role, content: m.content });
          }
        }
      }
    }

    // Ensure the current question is always appended as the final user turn.
    const last = apiMessages[apiMessages.length - 1];
    if (last && last.role === "user") {
      last.content += "\n" + question;
    } else {
      apiMessages.push({ role: "user", content: question });
    }

    const encoder = new TextEncoder();
    const resolvedThreadId = threadId ?? crypto.randomUUID();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const llmStream = await client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: systemPrompt,
            messages: apiMessages,
          });

          for await (const event of llmStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = event.delta.text;
              controller.enqueue(
                encoder.encode(
                  `event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`,
                ),
              );
            }
          }

          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({ thread_id: resolvedThreadId })}\n\n`,
            ),
          );
        } catch (err: any) {
          console.error("document chat stream error:", err);
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
    console.error("document chat route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
