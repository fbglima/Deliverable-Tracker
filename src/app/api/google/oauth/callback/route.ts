import { NextRequest, NextResponse } from "next/server";
import {
  decodeOAuthState,
  exchangeGoogleCode,
  getGoogleRedirectUri,
  googleAccessTokenCookie,
  googleOAuthStateCookie,
} from "@/lib/google/oauth";

type OAuthState = {
  nonce: string;
  returnTo: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const rawState = request.nextUrl.searchParams.get("state");
  const state = rawState ? decodeOAuthState<OAuthState>(rawState) : null;
  const storedNonce = request.cookies.get(googleOAuthStateCookie)?.value;
  const fallbackUrl = new URL("/workspaces?google=failed", request.url);

  if (!code || !state || !storedNonce || state.nonce !== storedNonce) {
    return NextResponse.redirect(fallbackUrl);
  }

  try {
    const token = await exchangeGoogleCode({
      code,
      redirectUri: getGoogleRedirectUri(request),
    });
    const redirectUrl = new URL(state.returnTo, request.url);

    redirectUrl.searchParams.set("google", "connected");

    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set({
      httpOnly: true,
      maxAge: Math.max(Math.min(token.expires_in ?? 3600, 3600) - 60, 60),
      name: googleAccessTokenCookie,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      value: token.access_token,
    });
    response.cookies.delete(googleOAuthStateCookie);

    return response;
  } catch {
    return NextResponse.redirect(fallbackUrl);
  }
}
