import { redirect } from "next/navigation";
import { AuthPanel } from "@/app/login/auth-panel";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <main className="min-h-screen bg-[var(--bg-app)] px-6 py-10 text-[var(--ink-1)]">
        <section className="dt-panel mx-auto mt-24 max-w-2xl p-6">
          <p className="dt-eyebrow">
            Deliverable Tracker
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Supabase setup required</h1>
          <p className="dt-sub mt-3">
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
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-10 text-[var(--ink-1)]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-between gap-10">
        <section className="max-w-xl">
          <p className="dt-eyebrow mb-4">
            Deliverable Tracker
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-[-0.01em] text-[var(--ink-1)]">
            Build a clear motion campaign matrix before scope gets blurry.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--ink-2)]">
            Producer-facing workspace, project, tree, and snapshot tools for
            Creative Units, durations, aspect ratios, and output formats.
          </p>
        </section>

        <AuthPanel message={params.message} />
      </div>
    </main>
  );
}
