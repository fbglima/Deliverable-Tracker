"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDefaultTree, normalizeTree } from "@/lib/tree";
import { getCurrentUser } from "@/lib/supabase/server";
import type { DeliverableTree } from "@/lib/types";

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireUser() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function createWorkspace(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = formValue(formData, "name");

  if (!name) {
    redirect("/workspaces");
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (error || !workspace) {
    throw new Error(error?.message ?? "Could not create workspace.");
  }

  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  redirect(`/workspaces/${workspace.id}`);
}

export async function createProject(workspaceId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = formValue(formData, "name");
  const clientName = formValue(formData, "client_name") || null;
  const description = formValue(formData, "description") || null;

  if (!name) {
    redirect(`/workspaces/${workspaceId}`);
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    throw new Error("You do not have access to this workspace.");
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name,
      client_name: clientName,
      campaign_name: null,
      description,
      tree_json: createDefaultTree(),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !project) {
    throw new Error(error?.message ?? "Could not create project.");
  }

  redirect(`/projects/${project.id}`);
}

export async function updateProjectTree(projectId: string, tree: DeliverableTree) {
  const { supabase } = await requireUser();
  const normalizedTree = normalizeTree(tree);

  const { error } = await supabase
    .from("projects")
    .update({
      tree_json: normalizedTree,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function saveSnapshot(
  projectId: string,
  payload: {
    name: string;
    notes?: string;
    sourceOrReason?: string;
    tree: DeliverableTree;
  },
) {
  const { supabase, user } = await requireUser();
  const name = payload.name.trim();

  if (!name) {
    throw new Error("Snapshot name is required.");
  }

  const { error } = await supabase.from("matrix_snapshots").insert({
    project_id: projectId,
    name,
    notes: payload.notes?.trim() || null,
    source_or_reason: payload.sourceOrReason?.trim() || "Manual save",
    tree_json: normalizeTree(payload.tree),
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
}
