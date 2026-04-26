import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createProject } from "@/app/actions";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Project, Workspace } from "@/lib/types";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: workspace }, { data: projects }] = await Promise.all([
    supabase.from("workspaces").select("*").eq("id", workspaceId).single(),
    supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
  ]);

  if (!workspace) {
    notFound();
  }

  const createProjectForWorkspace = createProject.bind(null, workspaceId);
  const typedWorkspace = workspace as Workspace;
  const typedProjects = (projects ?? []) as Project[];

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--ink-1)]">
      <div className="mx-auto max-w-6xl">
        <Link
          className="mono inline-flex items-center gap-2 text-xs font-semibold text-[var(--accent-ink)]"
          href="/workspaces"
        >
          <ArrowLeft className="h-4 w-4" />
          Workspaces
        </Link>

        <header className="mt-5 border-b border-[var(--line)] pb-6">
          <p className="dt-eyebrow">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{typedWorkspace.name}</h1>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="text-lg font-semibold">Projects / Campaigns</h2>
            <div className="mt-4 grid gap-3">
              {typedProjects.length ? (
                typedProjects.map((project) => (
                  <Link
                    className="dt-panel block p-5 transition hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-hover)]"
                    href={`/projects/${project.id}`}
                    key={project.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{project.name}</h3>
                        <p className="dt-sub mt-1">
                          {[project.client_name, project.campaign_name]
                            .filter(Boolean)
                            .join(" / ") || "No client or campaign label yet"}
                        </p>
                      </div>
                      <span className="mono text-xs font-semibold text-[var(--accent-ink)]">
                        Edit
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="dt-panel border-dashed p-6 text-sm text-[var(--ink-3)]">
                  Create a project to build a deliverables matrix.
                </div>
              )}
            </div>
          </div>

          <form
            action={createProjectForWorkspace}
            className="dt-panel h-fit p-5"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <h2 className="font-semibold">New project</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="dt-field">
                Project / Campaign
                <input
                  className="dt-input"
                  name="name"
                  placeholder="Spring Motion Campaign"
                  required
                />
              </label>
              <label className="dt-field">
                Client name
                <input
                  className="dt-input"
                  name="client_name"
                />
              </label>
              <label className="dt-field">
                Campaign name
                <input
                  className="dt-input"
                  name="campaign_name"
                />
              </label>
              <label className="dt-field">
                Description
                <textarea
                  className="dt-input min-h-24"
                  name="description"
                />
              </label>
            </div>
            <button className="dt-btn primary mt-4 w-full justify-center">
              Create project
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
