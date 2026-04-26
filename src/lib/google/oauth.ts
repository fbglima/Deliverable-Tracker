import type { NextRequest } from "next/server";

export const googleAccessTokenCookie = "dt_google_access_token";
export const googleOAuthStateCookie = "dt_google_oauth_state";

export const googleSheetsScopes = [
  "https://www.googleapis.com/auth/drive.file",
];

export type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
  };
}

export function isGoogleConfigured() {
  const config = getGoogleConfig();

  return Boolean(config.clientId && config.clientSecret);
}

export function getGoogleRedirectUri(request: NextRequest) {
  const configuredUri = getGoogleConfig().redirectUri;

  if (configuredUri) {
    return configuredUri;
  }

  return new URL("/api/google/oauth/callback", request.url).toString();
}

export function encodeOAuthState(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeOAuthState<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse & { access_token: string }> {
  const config = getGoogleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const token = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !token.access_token) {
    throw new Error(
      token.error_description ?? token.error ?? "Could not connect Google.",
    );
  }

  return {
    ...token,
    access_token: token.access_token,
  };
}
