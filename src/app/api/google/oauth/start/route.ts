import { NextRequest, NextResponse } from "next/server";
import {
  encodeOAuthState,
  getGoogleConfig,
  getGoogleRedirectUri,
  googleOAuthStateCookie,
  googleSheetsScopes,
  isGoogleConfigured,
} from "@/lib/google/oauth";

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/workspaces?google=not-configured", request.url),
    );
  }

  const returnTo =
    request.nextUrl.searchParams.get("returnTo") ?? request.nextUrl.origin;
  const nonce = crypto.randomUUID();
  const state = encodeOAuthState({
    nonce,
    returnTo,
  });
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const config = getGoogleConfig();

  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", getGoogleRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", googleSheetsScopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("access_type", "online");

  const response = NextResponse.redirect(authUrl);

  response.cookies.set({
    httpOnly: true,
    maxAge: 10 * 60,
    name: googleOAuthStateCookie,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: nonce,
  });

  return response;
}
