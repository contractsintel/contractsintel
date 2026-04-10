import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side document parser. Accepts PDF or DOCX file uploads via FormData,
// extracts text content, and returns it. This allows the document chat panel
// to accept real PDF/DOCX files instead of requiring copy-paste.
//
// POST: multipart/form-data with field "file"
// Returns: { text: string, filename: string, chars: number }

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 20MB limit
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum is 20MB." },
        { status: 400 },
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    let text = "";

    if (ext === "txt") {
      text = await file.text();
    } else if (ext === "pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      // pdf-parse handles text extraction from PDF buffers
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      text = result.text || "";
    } else if (ext === "docx") {
      // For DOCX, extract raw XML text content
      // The docx npm package is for creation, not parsing.
      // We'll extract text from the XML inside the DOCX zip.
      const JSZip = (await import("jszip")).default;
      const buffer = Buffer.from(await file.arrayBuffer());
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (docXml) {
        // Strip XML tags to get plain text
        text = docXml
          .replace(/<w:br[^>]*\/>/gi, "\n")
          .replace(/<\/w:p>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}. Supported: .pdf, .txt, .docx` },
        { status: 400 },
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this file. It may be scanned/image-based. Try copy-pasting the text instead.",
        },
        { status: 422 },
      );
    }

    // Truncate to 100k chars (the document chat limit)
    const truncated = text.length > 100_000;
    const finalText = text.slice(0, 100_000);

    return NextResponse.json({
      text: finalText,
      filename: file.name,
      chars: finalText.length,
      truncated,
      original_chars: text.length,
    });
  } catch (err: any) {
    console.error("document parse error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to parse document" },
      { status: 500 },
    );
  }
}
