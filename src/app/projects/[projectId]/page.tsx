import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TreeEditor } from "@/components/project/tree-editor";
import { calculateCounts, normalizeTree } from "@/lib/tree";
import { getCurrentUser } from "@/lib/supabase/server";
import type { MatrixSnapshot, Project } from "@/lib/types";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: project }, { data: snapshots }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase
      .from("matrix_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) {
    notFound();
  }

  const typedProject = {
    ...(project as Project),
    tree_json: normalizeTree((project as Project).tree_json),
  };
  const typedSnapshots = (snapshots ?? []) as MatrixSnapshot[];
  const counts = calculateCounts(typedProject.tree_json);

  return (
    <main className="min-h-screen bg-[#f6f5f2] px-6 py-8 text-[#1f2328]">
      <div className="mx-auto max-w-[1500px]">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#496c7a]"
          href={`/workspaces/${typedProject.workspace_id}`}
        >
          <ArrowLeft className="h-4 w-4" />
          Workspace
        </Link>

        <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-[#d8d2c8] pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6256]">
              Project / Campaign
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{typedProject.name}</h1>
            <p className="mt-2 text-sm text-[#69707a]">
              {[typedProject.client_name, typedProject.campaign_name]
                .filter(Boolean)
                .join(" / ") || "No client or campaign label yet"}
            </p>
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[#d8d2c8] bg-white text-center shadow-sm">
            <div className="border-r border-[#d8d2c8] px-5 py-3">
              <p className="text-2xl font-semibold">{counts.creativeDeliverables}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#69707a]">
                Creative
              </p>
            </div>
            <div className="px-5 py-3">
              <p className="text-2xl font-semibold">{counts.terminalFiles}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#69707a]">
                Terminal files
              </p>
            </div>
          </div>
        </header>

        <TreeEditor
          initialSnapshots={typedSnapshots}
          project={typedProject}
        />
      </div>
    </main>
  );
}
