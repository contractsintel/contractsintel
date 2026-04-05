import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const planMap: Record<string, string> = {
  "499": "discovery",
  "999": "bdpro",
  "2499": "team",
};

function getPlanFromAmount(amount: number): string {
  const dollars = String(Math.round(amount / 100));
  return planMap[dollars] || "discovery";
}

export async function POST(request: Request) {
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
      const email = session.customer_email || session.customer_details?.email;
      const customerId = session.customer as string;

      if (email) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .single();

        if (profile) {
          // Get subscription to determine plan
          let plan = "discovery";
          if (session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string);
            const amount = sub.items.data[0]?.price?.unit_amount || 0;
            plan = getPlanFromAmount(amount);
          }

          await supabase
            .from("profiles")
            .update({ plan, stripe_customer_id: customerId })
            .eq("id", profile.id);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const amount = sub.items.data[0]?.price?.unit_amount || 0;
      const plan = sub.status === "active" ? getPlanFromAmount(amount) : "cancelled";

      await supabase
        .from("profiles")
        .update({ plan })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      await supabase
        .from("profiles")
        .update({ plan: "cancelled" })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      await supabase
        .from("profiles")
        .update({ plan: "past_due" })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const lineItem = invoice.lines.data[0] as any;
      const amount = lineItem?.price?.unit_amount || 0;

      await supabase
        .from("profiles")
        .update({ plan: getPlanFromAmount(amount) })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
