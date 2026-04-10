import { NextRequest, NextResponse } from "next/server";
import {
  sendSlackNotification,
  sendTeamsNotification,
  buildSlackTestMessage,
  buildTeamsTestMessage,
} from "@/lib/webhook-notify";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhook_url, platform } = body as {
      webhook_url?: string;
      platform?: "slack" | "teams";
    };

    if (!webhook_url || !platform) {
      return NextResponse.json(
        { error: "webhook_url and platform are required" },
        { status: 400 }
      );
    }

    if (platform !== "slack" && platform !== "teams") {
      return NextResponse.json(
        { error: 'platform must be "slack" or "teams"' },
        { status: 400 }
      );
    }

    // Minimal URL validation
    try {
      new URL(webhook_url);
    } catch {
      return NextResponse.json(
        { error: "webhook_url must be a valid URL" },
        { status: 400 }
      );
    }

    const result =
      platform === "teams"
        ? await sendTeamsNotification(webhook_url, buildTeamsTestMessage())
        : await sendSlackNotification(webhook_url, buildSlackTestMessage());

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Webhook test error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send test message" },
      { status: 500 }
    );
  }
}
