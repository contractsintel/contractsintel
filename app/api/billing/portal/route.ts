import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData } = await supabase
    .from("users")
    .select("organizations(stripe_customer_id)")
    .eq("auth_id", user.id)
    .single();

  const customerId = (userData as any)?.organizations?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ error: "No subscription found" }, { status: 400 });

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://contractsintel.com"}/dashboard/settings`,
  });

  return NextResponse.json({ url: session.url });
}
