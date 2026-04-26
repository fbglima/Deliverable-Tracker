import { notFound, redirect } from "next/navigation";
import { TreeEditor } from "@/components/project/tree-editor";
import { normalizeTree } from "@/lib/tree";
import { getCurrentUser } from "@/lib/supabase/server";
import type { MatrixSnapshot, Project, Workspace } from "@/lib/types";

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
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", typedProject.workspace_id)
    .single();
  const typedSnapshots = (snapshots ?? []) as MatrixSnapshot[];
  const typedWorkspace = workspace as Workspace | null;

  return (
    <TreeEditor
      initialSnapshots={typedSnapshots}
      project={typedProject}
      workspaceName={typedWorkspace?.name ?? "Workspace"}
    />
  );
}
