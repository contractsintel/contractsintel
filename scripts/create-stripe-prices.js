#!/usr/bin/env node
/**
 * One-shot Stripe price creator.
 * Usage: STRIPE_SECRET_KEY=sk_... node scripts/create-stripe-prices.js
 *
 * Creates (or reuses) products + monthly prices for Discovery, BD Pro, Team
 * and prints the Vercel env vars + commands to set them.
 */

const Stripe = require("stripe");

const TIERS = [
  { key: "discovery", name: "ContractsIntel Discovery", amount: 9900,  envVar: "STRIPE_PRICE_DISCOVERY" },
  { key: "bd_pro",    name: "ContractsIntel BD Pro",    amount: 29900, envVar: "STRIPE_PRICE_BD_PRO" },
  { key: "team",      name: "ContractsIntel Team",      amount: 89900, envVar: "STRIPE_PRICE_TEAM" },
];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("ERROR: STRIPE_SECRET_KEY env var required");
    process.exit(1);
  }
  const stripe = new Stripe(key);
  const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`\nStripe mode: ${mode}\n`);

  const results = [];
  for (const tier of TIERS) {
    // Find or create product
    let product;
    const existing = await stripe.products.search({
      query: `metadata['tier']:'${tier.key}'`,
    });
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`Reusing product ${product.id} for ${tier.key}`);
    } else {
      product = await stripe.products.create({
        name: tier.name,
        metadata: { tier: tier.key },
      });
      console.log(`Created product ${product.id} for ${tier.key}`);
    }

    // Always create a fresh price (Stripe prices are immutable; we want a clean new one)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.amount,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: `${tier.key}_monthly_${tier.amount}`,
      transfer_lookup_key: true,
      metadata: { tier: tier.key, version: "2026-04-16-v2" },
    });
    console.log(`Created price ${price.id} = $${(tier.amount / 100).toFixed(0)}/mo for ${tier.key}\n`);

    results.push({ ...tier, productId: product.id, priceId: price.id });
  }

  console.log("\n========== ENV VARS TO SET ==========\n");
  for (const r of results) {
    console.log(`${r.envVar}=${r.priceId}`);
  }
  console.log("\n========== VERCEL COMMANDS ==========\n");
  for (const r of results) {
    console.log(`echo "${r.priceId}" | vercel env add ${r.envVar} production`);
    console.log(`echo "${r.priceId}" | vercel env add ${r.envVar} preview`);
  }
  console.log("\nDone. Redeploy after adding env vars: vercel --prod\n");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
