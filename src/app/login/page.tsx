import { redirect } from "next/navigation";
import { signIn, signUp } from "@/app/auth-actions";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <main className="min-h-screen bg-[#f6f5f2] px-6 py-10 text-[#1f2328]">
        <section className="mx-auto mt-24 max-w-2xl rounded-lg border border-[#d8d2c8] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6256]">
            Deliverable Tracker
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Supabase setup required</h1>
          <p className="mt-3 text-[#5f646c]">
            Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`, then run the SQL in
            `supabase/schema.sql`.
          </p>
        </section>
      </main>
    );
  }

  const { user } = await getCurrentUser();
  const params = await searchParams;

  if (user) {
    redirect("/workspaces");
  }

  return (
    <main className="min-h-screen bg-[#f6f5f2] px-6 py-10 text-[#1f2328]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-between gap-10">
        <section className="max-w-xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6256]">
            Deliverable Tracker
          </p>
          <h1 className="text-5xl font-semibold leading-tight text-[#17191c]">
            Build a clear motion campaign matrix before scope gets blurry.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[#5f646c]">
            Producer-facing workspace, project, tree, and snapshot tools for
            Creative Units, durations, aspect ratios, and output formats.
          </p>
        </section>

        <section className="w-full max-w-md rounded-lg border border-[#d8d2c8] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-2 text-sm text-[#69707a]">
            Use Supabase email/password auth for the MVP.
          </p>

          {params.message ? (
            <div className="mt-4 rounded-md border border-[#d8d2c8] bg-[#fbfaf8] px-3 py-2 text-sm text-[#5f4d3f]">
              {params.message}
            </div>
          ) : null}

          <form action={signIn} className="mt-6 grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Email
              <input
                className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                name="email"
                type="email"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Password
              <input
                className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                name="password"
                type="password"
                required
                minLength={6}
              />
            </label>
            <button className="mt-2 rounded-md bg-[#1f2328] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#343941]">
              Sign in
            </button>
          </form>

          <form action={signUp} className="mt-5 border-t border-[#e6e0d8] pt-5">
            <h3 className="text-sm font-semibold">Create account</h3>
            <div className="mt-3 grid gap-3">
              <input
                className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                name="email"
                type="email"
                placeholder="producer@example.com"
                required
              />
              <input
                className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                name="password"
                type="password"
                placeholder="Password"
                required
                minLength={6}
              />
              <button className="rounded-md border border-[#1f2328] px-4 py-2.5 text-sm font-semibold hover:bg-[#f1eee8]">
                Sign up
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
