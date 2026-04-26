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
    <main className="min-h-screen bg-[#f6f5f2] px-6 py-8 text-[#1f2328]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d8d2c8] pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6256]">
              Deliverable Tracker
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Workspaces</h1>
          </div>
          <form action={signOut}>
            <button className="rounded-md border border-[#cfc8bd] px-4 py-2 text-sm font-semibold hover:bg-white">
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
                    className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm transition hover:border-[#496c7a]"
                    href={`/workspaces/${membership.workspaces.id}`}
                    key={membership.workspaces.id}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{membership.workspaces.name}</h3>
                        <p className="mt-1 text-sm text-[#69707a]">
                          Role: {membership.role}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#496c7a]">
                        Open
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[#cfc8bd] bg-white p-6 text-sm text-[#69707a]">
                  Create a workspace to start tracking campaign deliverables.
                </div>
              )}
            </div>
          </div>

          <form
            action={createWorkspace}
            className="h-fit rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <h2 className="font-semibold">New workspace</h2>
            </div>
            <label className="mt-4 grid gap-1 text-sm font-medium">
              Workspace name
              <input
                className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                name="name"
                placeholder="Ways & Means"
                required
              />
            </label>
            <button className="mt-4 w-full rounded-md bg-[#1f2328] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#343941]">
              Create workspace
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
