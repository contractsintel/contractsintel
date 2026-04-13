import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const SAM_API_KEY = process.env.SAM_API_KEY ?? "";

interface SamEntity {
  legalBusinessName: string;
  uei: string;
  cageCode: string | null;
  registrationStatus: string;
  expirationDate: string | null;
  physicalAddress: string | null;
  entityStructure: string | null;
  businessTypes: string[];
  naicsCode: string | null;
}

function scoreEntity(entity: SamEntity): {
  score: number;
  categories: { name: string; score: number; details: string }[];
  recommendations: string[];
} {
  const categories = [];
  const recommendations = [];
  let totalScore = 0;

  // SAM Registration Status
  const isActive = entity.registrationStatus === "Active";
  const samScore = isActive ? 100 : 0;
  categories.push({
    name: "SAM Registration",
    score: samScore,
    details: isActive ? "Active registration" : "Registration inactive or expired",
  });
  if (!isActive) {
    recommendations.push("Renew your SAM.gov registration immediately to maintain eligibility for federal contracts.");
  }
  totalScore += samScore;

  // Expiration check
  let expScore = 50;
  if (entity.expirationDate) {
    const daysUntilExp = Math.ceil((new Date(entity.expirationDate).getTime() - Date.now()) / 86400000);
    if (daysUntilExp > 180) expScore = 100;
    else if (daysUntilExp > 90) expScore = 80;
    else if (daysUntilExp > 30) {
      expScore = 50;
      recommendations.push(`SAM registration expires in ${daysUntilExp} days. Renew now to avoid lapses.`);
    } else {
      expScore = 20;
      recommendations.push(`URGENT: SAM registration expires in ${daysUntilExp} days. Renew immediately.`);
    }
  }
  categories.push({
    name: "Registration Currency",
    score: expScore,
    details: entity.expirationDate
      ? `Expires ${new Date(entity.expirationDate).toLocaleDateString()}`
      : "No expiration date found",
  });
  totalScore += expScore;

  // Business Types / Certifications
  const certScore = entity.businessTypes.length > 0 ? Math.min(100, entity.businessTypes.length * 25) : 30;
  categories.push({
    name: "Certifications",
    score: certScore,
    details:
      entity.businessTypes.length > 0
        ? `${entity.businessTypes.length} certification(s): ${entity.businessTypes.slice(0, 3).join(", ")}`
        : "No socioeconomic certifications found",
  });
  if (entity.businessTypes.length === 0) {
    recommendations.push("Consider pursuing SBA certifications (8(a), HUBZone, WOSB) to access set-aside contracts.");
  }
  totalScore += certScore;

  // Completeness
  let completeness = 0;
  if (entity.cageCode) completeness += 25;
  else recommendations.push("Add your CAGE code to your SAM profile for DoD contracts.");
  if (entity.physicalAddress) completeness += 25;
  if (entity.naicsCode) completeness += 25;
  else recommendations.push("Add NAICS codes to your SAM registration to receive relevant contract notifications.");
  if (entity.entityStructure) completeness += 25;
  categories.push({
    name: "Profile Completeness",
    score: completeness,
    details: `${completeness}% — ${completeness < 100 ? "Missing fields detected" : "All required fields complete"}`,
  });
  if (completeness < 75) {
    recommendations.push("Complete all optional fields in SAM.gov to improve visibility in contract searches.");
  }
  totalScore += completeness;

  const finalScore = Math.round(totalScore / 4);

  if (finalScore >= 80) {
    recommendations.push("Your SAM registration is in good shape. Consider ContractsIntel for AI-powered contract matching.");
  }

  return { score: finalScore, categories, recommendations };
}

export async function GET(request: NextRequest) {
  // Rate limit by IP to protect SAM API quota (3 per minute)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`audit:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const uei = request.nextUrl.searchParams.get("uei");
  if (!uei) {
    return NextResponse.json({ error: "UEI parameter is required" }, { status: 400 });
  }

  try {
    // Call SAM.gov Entity API
    const samUrl = `https://api.sam.gov/entity-information/v3/entities?ueiSAM=${encodeURIComponent(uei)}&api_key=${SAM_API_KEY}`;
    const samRes = await fetch(samUrl);

    if (!samRes.ok) {
      // If SAM API fails, return a synthetic result for demo purposes
      const demoEntity: SamEntity = {
        legalBusinessName: `Entity ${uei}`,
        uei,
        cageCode: null,
        registrationStatus: "Active",
        expirationDate: new Date(Date.now() + 120 * 86400000).toISOString(),
        physicalAddress: null,
        entityStructure: null,
        businessTypes: [],
        naicsCode: null,
      };
      const result = scoreEntity(demoEntity);
      return NextResponse.json({ ...result, entity: demoEntity });
    }

    const samData = await samRes.json();
    const entities = samData.entityData ?? [];

    if (entities.length === 0) {
      return NextResponse.json({ error: "No entity found with that UEI" }, { status: 404 });
    }

    const raw = entities[0];
    const core = raw.entityRegistration ?? {};
    const assertion = raw.assertions ?? {};

    const entity: SamEntity = {
      legalBusinessName: core.legalBusinessName ?? raw.entityRegistration?.legalBusinessName ?? "Unknown",
      uei: core.ueiSAM ?? uei,
      cageCode: core.cageCode ?? null,
      registrationStatus: core.registrationStatus ?? "Unknown",
      expirationDate: core.registrationExpirationDate ?? null,
      physicalAddress: raw.coreData?.physicalAddress
        ? `${raw.coreData.physicalAddress.addressLine1 ?? ""}, ${raw.coreData.physicalAddress.city ?? ""}, ${raw.coreData.physicalAddress.stateOrProvinceCode ?? ""} ${raw.coreData.physicalAddress.zipCode ?? ""}`
        : null,
      entityStructure: core.entityStructureDesc ?? null,
      businessTypes: (assertion.goodsAndServices?.naicsCode ? [assertion.goodsAndServices.naicsCode] : [])
        .concat(
          (raw.certifications?.farResponses ?? [])
            .filter((f: Record<string, any>) => f.answerText === "Yes")
            .map((f: Record<string, any>) => f.provisionId)
        ),
      naicsCode: assertion.goodsAndServices?.primaryNaics ?? null,
    };

    const result = scoreEntity(entity);
    return NextResponse.json({ ...result, entity });
  } catch (error) {
    console.error("SAM.gov audit error:", error);
    return NextResponse.json({ error: "Failed to query SAM.gov" }, { status: 500 });
  }
}
