import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const PRICE_MAP: Record<string, string> = {
  discovery: "price_1TH7X0EMMzxoqfnR94CLvHHl",
  bd_pro: "price_1TH7dAEMMzxoqfnR70vzp9iE",
  team: "price_1TH7hFEMMzxoqfnRWlEI1OM4",
};

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tier } = await request.json();
  const priceId = PRICE_MAP[tier];
  if (!priceId) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  // Get org info
  const { data: userData } = await supabase
    .from("users")
    .select("organization_id, organizations(stripe_customer_id, name)")
    .eq("auth_id", user.id)
    .single();

  const org = (userData as any)?.organizations;
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
