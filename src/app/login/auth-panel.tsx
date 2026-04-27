"use client";

import { useState } from "react";
import { signIn, signUp } from "@/app/auth-actions";

export function AuthPanel({ message }: { message?: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  return (
    <section className="dt-panel w-full max-w-md p-6">
      <h2 className="text-xl font-semibold">
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </h2>
      <p className="dt-sub mt-2">
        {mode === "sign-in"
          ? "Access your workspaces and delivery matrices."
          : "Create your producer account. You may need to confirm your email before signing in."}
      </p>

      {message ? (
        <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--accent-tint)] px-3 py-2 text-sm text-[var(--accent-ink)]">
          {message}
        </div>
      ) : null}

      {mode === "sign-in" ? (
        <form action={signIn} className="mt-6 grid gap-3">
          <label className="dt-field">
            Email
            <input className="dt-input" name="email" type="email" required />
          </label>
          <label className="dt-field">
            Password
            <input
              className="dt-input"
              name="password"
              type="password"
              required
              minLength={6}
            />
          </label>
          <button className="dt-btn primary mt-2 justify-center">Sign in</button>
        </form>
      ) : (
        <form action={signUp} className="mt-6 grid gap-3">
          <label className="dt-field">
            Email
            <input
              className="dt-input"
              name="email"
              type="email"
              placeholder="producer@example.com"
              required
            />
          </label>
          <label className="dt-field">
            Password
            <input
              className="dt-input"
              name="password"
              type="password"
              required
              minLength={6}
            />
          </label>
          <button className="dt-btn primary mt-2 justify-center">
            Create account
          </button>
        </form>
      )}

      <div className="mt-5 border-t border-[var(--line)] pt-5 text-sm text-[var(--ink-3)]">
        {mode === "sign-in" ? (
          <>
            New here?{" "}
            <button
              className="font-semibold text-[var(--accent-ink)]"
              onClick={() => setMode("sign-up")}
              type="button"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already confirmed?{" "}
            <button
              className="font-semibold text-[var(--accent-ink)]"
              onClick={() => setMode("sign-in")}
              type="button"
            >
              Sign in instead
            </button>
          </>
        )}
      </div>
    </section>
  );
}
