import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only gate /dashboard. /login and /signup don't need middleware — they're
  // public and including them previously meant a Supabase latency spike could
  // 504 users trying to *sign in*, which made outages unrecoverable.
  matcher: ["/dashboard/:path*"],
};
