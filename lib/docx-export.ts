// G07 Word export. Converts a generated proposal object (the same shape
// returned by `POST /api/proposals/generate`) into a .docx buffer using
// the `docx` npm package.

import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export interface ProposalSections {
  executive_summary?: string;
  technical_approach?: string;
  past_performance?: string;
  management_plan?: string;
}

export interface ProposalExportInput {
  title: string;
  company?: string;
  agency?: string;
  solicitation?: string;
  sections: ProposalSections;
}

const SECTION_DEFS: Array<{ key: keyof ProposalSections; heading: string }> = [
  { key: "executive_summary", heading: "1. Executive Summary" },
  { key: "technical_approach", heading: "2. Technical Approach" },
  { key: "past_performance", heading: "3. Past Performance" },
  { key: "management_plan", heading: "4. Management Plan" },
];

/**
 * Split long section body text into paragraphs. Treat blank lines as
 * paragraph breaks and bullet-style lines (starting with "- " or "* ")
 * as list items.
 */
function buildBodyParagraphs(text: string): Paragraph[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: Paragraph[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const isBulletBlock = lines.length > 1 && lines.every((l) => /^[-*]\s+/.test(l));
    if (isBulletBlock) {
      for (const line of lines) {
        out.push(
          new Paragraph({
            text: line.replace(/^[-*]\s+/, ""),
            numbering: { reference: "proposal-bullets", level: 0 },
            spacing: { after: 100 },
          }),
        );
      }
    } else {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: block, size: 22 })],
          spacing: { after: 200 },
        }),
      );
    }
  }
  return out;
}

export async function buildProposalDocx(
  input: ProposalExportInput,
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Title page
  children.push(
    new Paragraph({
      text: input.title || "Proposal",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );
  if (input.company) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: input.company, size: 26, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
    );
  }
  const metaParts: string[] = [];
  if (input.agency) metaParts.push(`Agency: ${input.agency}`);
  if (input.solicitation) metaParts.push(`Solicitation: ${input.solicitation}`);
  if (metaParts.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: metaParts.join("  ·  "), size: 22, italics: true, color: "555555" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    );
  }

  // Body sections
  for (const def of SECTION_DEFS) {
    const body = input.sections[def.key];
    if (!body || !body.trim()) continue;
    children.push(
      new Paragraph({
        text: def.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
      }),
    );
    for (const p of buildBodyParagraphs(body)) children.push(p);
  }

  const doc = new Document({
    creator: "ContractsIntel",
    title: input.title || "Proposal",
    description: "Federal proposal draft exported from ContractsIntel",
    numbering: {
      config: [
        {
          reference: "proposal-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
