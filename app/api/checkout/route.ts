import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

// Prices: Discovery $99/mo, BD Pro $299/mo, Team $899/mo
// IMPORTANT: env vars must be set — old hardcoded fallback IDs were $499/$999/$2,499
// and would charge customers the wrong amount.
const PRICE_MAP: Record<string, string | undefined> = {
  discovery: process.env.STRIPE_PRICE_DISCOVERY,
  bd_pro: process.env.STRIPE_PRICE_BD_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
};

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tier } = await request.json();
  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    if (tier in PRICE_MAP) {
      return NextResponse.json(
        { error: `Stripe price not configured for tier "${tier}". Set STRIPE_PRICE_${tier.toUpperCase()} env var.` },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  // Get org info
  const { data: userData } = await supabase
    .from("users")
    .select("organization_id, organizations(stripe_customer_id, name)")
    .eq("auth_id", user.id)
    .single();

  const org = (userData as Record<string, any> | null)?.organizations as Record<string, any> | undefined;
  let customerId = org?.stripe_customer_id;

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org?.name || undefined,
      metadata: { organization_id: userData?.organization_id || "" },
    });
    customerId = customer.id;

    await supabase
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", userData?.organization_id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_collection: "if_required",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: 14 },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://contractsintel.com"}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://contractsintel.com"}/dashboard?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
