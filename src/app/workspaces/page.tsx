import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createWorkspace } from "@/app/actions";
import { signOut } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/supabase/server";
import type { WorkspaceMembership } from "@/lib/types";

export default async function WorkspacesPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("workspace_members")
    .select("role, workspaces ( id, name, created_at, created_by )")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const memberships = (data ?? []) as unknown as WorkspaceMembership[];

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--ink-1)]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <p className="dt-eyebrow">
              Deliverable Tracker
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Workspaces</h1>
          </div>
          <form action={signOut}>
            <button className="dt-btn">
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="text-lg font-semibold">Your workspaces</h2>
            <div className="mt-4 grid gap-3">
              {memberships.length ? (
                memberships.map((membership) => (
                  <Link
                    className="dt-panel block p-5 transition hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-hover)]"
                    href={`/workspaces/${membership.workspaces.id}`}
                    key={membership.workspaces.id}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{membership.workspaces.name}</h3>
                        <p className="dt-sub mt-1">
                          Role: {membership.role}
                        </p>
                      </div>
                      <span className="mono text-xs font-semibold text-[var(--accent-ink)]">
                        Open
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="dt-panel border-dashed p-6 text-sm text-[var(--ink-3)]">
                  Create a workspace to start tracking campaign deliverables.
                </div>
              )}
            </div>
          </div>

          <form
            action={createWorkspace}
            className="dt-panel h-fit p-5"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <h2 className="font-semibold">New workspace</h2>
            </div>
            <label className="dt-field mt-4">
              Workspace name
              <input
                className="dt-input"
                name="name"
                placeholder="Ways & Means"
                required
              />
            </label>
            <button className="dt-btn primary mt-4 w-full justify-center">
              Create workspace
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
