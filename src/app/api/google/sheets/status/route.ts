import { cookies } from "next/headers";
import {
  googleAccessTokenCookie,
  isGoogleConfigured,
} from "@/lib/google/oauth";

export async function GET() {
  const cookieStore = await cookies();

  return Response.json({
    configured: isGoogleConfigured(),
    connected: Boolean(cookieStore.get(googleAccessTokenCookie)?.value),
  });
}
