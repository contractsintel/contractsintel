import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const planMap: Record<string, string> = {
  "99": "discovery",
  "299": "bd_pro",
  "899": "team",
};

function getPlanFromAmount(amount: number): string {
  const dollars = String(Math.round(amount / 100));
  return planMap[dollars] || "discovery";
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;

      let tier = "discovery";
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const amount = sub.items.data[0]?.price?.unit_amount || 0;
        tier = getPlanFromAmount(amount);
      }

      await supabase
        .from("organizations")
        .update({
          subscription_tier: tier,
          subscription_status: "active",
          stripe_subscription_id: session.subscription as string,
          card_added: true,
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const amount = sub.items.data[0]?.price?.unit_amount || 0;

      await supabase
        .from("organizations")
        .update({
          subscription_tier: sub.status === "active" ? getPlanFromAmount(amount) : "discovery",
          subscription_status: sub.status === "active" ? "active" : sub.status === "trialing" ? "trialing" : "cancelled",
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      await supabase
        .from("organizations")
        .update({ subscription_status: "cancelled", subscription_tier: "discovery" })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      await supabase
        .from("organizations")
        .update({ subscription_status: "past_due" })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const lineItem = invoice.lines.data[0] as Record<string, any>;
      const amount = lineItem?.price?.unit_amount || 0;

      await supabase
        .from("organizations")
        .update({
          subscription_tier: getPlanFromAmount(amount),
          subscription_status: "active",
        })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
