import { redirect } from "next/navigation";

// /pricing redirects to the homepage pricing section
export default function PricingPage() {
  redirect("/#pricing");
}
