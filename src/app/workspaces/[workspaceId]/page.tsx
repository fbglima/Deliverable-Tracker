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
    <main className="min-h-screen bg-[#f6f5f2] px-6 py-8 text-[#1f2328]">
      <div className="mx-auto max-w-6xl">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#496c7a]"
          href="/workspaces"
        >
          <ArrowLeft className="h-4 w-4" />
          Workspaces
        </Link>

        <header className="mt-5 border-b border-[#d8d2c8] pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6256]">
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
                    className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm transition hover:border-[#496c7a]"
                    href={`/projects/${project.id}`}
                    key={project.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{project.name}</h3>
                        <p className="mt-1 text-sm text-[#69707a]">
                          {[project.client_name, project.campaign_name]
                            .filter(Boolean)
                            .join(" / ") || "No client or campaign label yet"}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#496c7a]">
                        Edit
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[#cfc8bd] bg-white p-6 text-sm text-[#69707a]">
                  Create a project to build a deliverables matrix.
                </div>
              )}
            </div>
          </div>

          <form
            action={createProjectForWorkspace}
            className="h-fit rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <h2 className="font-semibold">New project</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                Project / Campaign
                <input
                  className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                  name="name"
                  placeholder="Spring Motion Campaign"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Client name
                <input
                  className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                  name="client_name"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Campaign name
                <input
                  className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                  name="campaign_name"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Description
                <textarea
                  className="min-h-24 rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                  name="description"
                />
              </label>
            </div>
            <button className="mt-4 w-full rounded-md bg-[#1f2328] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#343941]">
              Create project
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
