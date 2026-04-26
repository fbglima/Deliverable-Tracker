"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node as FlowNode,
} from "@xyflow/react";
import { Circle, Save } from "lucide-react";
import { saveSnapshot, updateProjectTree } from "@/app/actions";
import {
  calculateCounts,
  childOptions,
  createNode,
  nodeTypeLabels,
  presetValues,
} from "@/lib/tree";
import type {
  DeliverableNode,
  DeliverableTree,
  MatrixNodeType,
  MatrixSnapshot,
  Project,
} from "@/lib/types";

type TreeEditorProps = {
  project: Project;
  initialSnapshots: MatrixSnapshot[];
};

type FlowData = {
  label: ReactNode;
  nodeType: string;
};

export function TreeEditor({ project, initialSnapshots }: TreeEditorProps) {
  const router = useRouter();
  const [tree, setTree] = useState<DeliverableTree>(project.tree_json);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    tree.nodes[0]?.id ?? null,
  );
  const [newChildType, setNewChildType] = useState<MatrixNodeType>("duration");
  const [newChildLabel, setNewChildLabel] = useState("");
  const [bulkLabels, setBulkLabels] = useState(":60\n:30\n:15\n:06");
  const [snapshotName, setSnapshotName] = useState("Current");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [status, setStatus] = useState("Unsaved edits stay local until saved.");
  const [isPending, startTransition] = useTransition();

  const selectedNode = selectedNodeId
    ? findNode(tree.nodes, selectedNodeId)
    : null;
  const counts = calculateCounts(tree);
  const availableChildTypes = selectedNode
    ? childOptions[selectedNode.nodeType]
    : (["creative_unit"] as MatrixNodeType[]);
  const activeChildType = availableChildTypes.includes(newChildType)
    ? newChildType
    : availableChildTypes[0] ?? "creative_unit";

  const { nodes, edges } = useMemo(() => buildFlow(tree), [tree]);

  function commitTree(nextTree: DeliverableTree) {
    setTree(nextTree);
    setStatus("Unsaved changes");
  }

  function renameSelected(label: string) {
    if (!selectedNodeId) {
      return;
    }

    commitTree({
      ...tree,
      nodes: mapNodes(tree.nodes, selectedNodeId, (node) => ({
        ...node,
        label,
      })),
    });
  }

  function addChild() {
    const label =
      newChildLabel.trim() || presetValues[activeChildType][0] || "New branch";
    const child = createNode(activeChildType, label);

    if (!selectedNodeId) {
      commitTree({ ...tree, nodes: [...tree.nodes, child] });
      setSelectedNodeId(child.id);
      setNewChildLabel("");
      return;
    }

    commitTree({
      ...tree,
      nodes: mapNodes(tree.nodes, selectedNodeId, (node) => ({
        ...node,
        children: [...(node.children ?? []), child],
      })),
    });
    setSelectedNodeId(child.id);
    setNewChildLabel("");
  }

  function bulkAdd() {
    const labels = bulkLabels
      .split(/\n|,/)
      .map((label) => label.trim())
      .filter(Boolean);

    if (!labels.length) {
      return;
    }

    const children = labels.map((label) => createNode(activeChildType, label));

    if (!selectedNodeId) {
      commitTree({ ...tree, nodes: [...tree.nodes, ...children] });
      setSelectedNodeId(children[0]?.id ?? null);
      return;
    }

    commitTree({
      ...tree,
      nodes: mapNodes(tree.nodes, selectedNodeId, (node) => ({
        ...node,
        children: [...(node.children ?? []), ...children],
      })),
    });
  }

  function deleteSelected() {
    if (!selectedNodeId) {
      return;
    }

    commitTree({ ...tree, nodes: removeNode(tree.nodes, selectedNodeId) });
    setSelectedNodeId(null);
  }

  function saveTree() {
    startTransition(async () => {
      try {
        await updateProjectTree(project.id, tree);
        setStatus("Tree saved");
        router.refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save tree");
      }
    });
  }

  function createSnapshot() {
    startTransition(async () => {
      try {
        await saveSnapshot(project.id, {
          name: snapshotName,
          notes: snapshotNotes,
          sourceOrReason: "Manual save",
          tree,
        });
        setSnapshotName("Current");
        setSnapshotNotes("");
        setStatus("Snapshot saved");
        router.refresh();
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Could not save snapshot",
        );
      }
    });
  }

  return (
    <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="overflow-hidden rounded-lg border border-[#d8d2c8] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e0d8] px-5 py-4">
          <div>
            <h2 className="font-semibold">Deliverables Tree</h2>
            <p className="mt-1 text-sm text-[#69707a]">
              Default hierarchy: Creative Unit {"->"} Duration / Cut {"->"}{" "}
              Aspect Ratio / Placement {"->"} Output Format.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md bg-[#eef2f0] px-3 py-1.5 font-semibold text-[#385c4a]">
              {counts.creativeDeliverables} creative
            </span>
            <span className="rounded-md bg-[#f0eee8] px-3 py-1.5 font-semibold text-[#6f6256]">
              {counts.terminalFiles} terminal files
            </span>
          </div>
        </div>

        <div className="h-[680px]">
          <ReactFlow
            edges={edges}
            fitView
            nodes={nodes}
            nodesDraggable={false}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          >
            <Background color="#d8d2c8" gap={24} />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside className="grid gap-4">
        <div className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Edit branch</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#69707a]">
              JSON tree
            </span>
          </div>

          {selectedNode ? (
            <div className="mt-4 grid gap-3">
              <p className="text-sm text-[#69707a]">
                {nodeTypeLabels[selectedNode.nodeType]}
              </p>
              <input
                className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                onChange={(event) => renameSelected(event.target.value)}
                value={selectedNode.label}
              />

              <label className="grid gap-1 text-sm font-medium">
                Child level
                <select
                  className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                  onChange={(event) =>
                    setNewChildType(event.target.value as MatrixNodeType)
                  }
                  disabled={!availableChildTypes.length}
                  value={activeChildType}
                >
                  {availableChildTypes.map((type) => (
                    <option key={type} value={type}>
                      {nodeTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium">
                New branch label
                <input
                  className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
                  onChange={(event) => setNewChildLabel(event.target.value)}
                  placeholder={presetValues[activeChildType][0]}
                  value={newChildLabel}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="rounded-md bg-[#1f2328] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={!availableChildTypes.length}
                  onClick={addChild}
                  type="button"
                >
                  Add child
                </button>
                <button
                  className="rounded-md border border-[#c63d2f] px-3 py-2 text-sm font-semibold text-[#a33127] hover:bg-[#fff5f3]"
                  onClick={deleteSelected}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-[#69707a]">
              Select a node in the tree to rename it or add branches.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Bulk add</h2>
          <p className="mt-1 text-sm text-[#69707a]">
            Add common durations, aspect ratios, platforms, technical variants,
            or output formats under the selected branch.
          </p>
          <textarea
            className="mt-4 min-h-28 w-full rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
            onChange={(event) => setBulkLabels(event.target.value)}
            value={bulkLabels}
          />
          <button
            className="mt-3 w-full rounded-md border border-[#1f2328] px-3 py-2 text-sm font-semibold hover:bg-[#f1eee8]"
            disabled={!availableChildTypes.length}
            onClick={bulkAdd}
            type="button"
          >
            Bulk add as {nodeTypeLabels[activeChildType]}
          </button>
        </div>

        <div className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Save</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-[#69707a]">
            <Circle className="h-2.5 w-2.5 fill-current" />
            {isPending ? "Saving..." : status}
          </p>
          <button
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#1f2328] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isPending}
            onClick={saveTree}
            type="button"
          >
            <Save className="h-4 w-4" />
            Save current tree
          </button>
        </div>

        <div className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Manual snapshot</h2>
          <div className="mt-4 grid gap-3">
            <input
              className="rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
              onChange={(event) => setSnapshotName(event.target.value)}
              value={snapshotName}
            />
            <textarea
              className="min-h-20 rounded-md border border-[#cfc8bd] px-3 py-2 outline-none focus:border-[#496c7a]"
              onChange={(event) => setSnapshotNotes(event.target.value)}
              placeholder="Notes"
              value={snapshotNotes}
            />
            <button
              className="rounded-md border border-[#1f2328] px-3 py-2 text-sm font-semibold hover:bg-[#f1eee8]"
              disabled={isPending}
              onClick={createSnapshot}
              type="button"
            >
              Save snapshot
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-[#d8d2c8] bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Snapshots</h2>
          <div className="mt-4 grid gap-3">
            {initialSnapshots.length ? (
              initialSnapshots.map((snapshot) => (
                <div
                  className="rounded-md border border-[#e6e0d8] p-3"
                  key={snapshot.id}
                >
                  <p className="font-medium">{snapshot.name}</p>
                  <p className="mt-1 text-xs text-[#69707a]">
                    {new Date(snapshot.created_at).toLocaleString()}
                  </p>
                  {snapshot.notes ? (
                    <p className="mt-2 text-sm text-[#69707a]">{snapshot.notes}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-[#69707a]">
                No snapshots yet. Save one when the matrix reaches a useful
                checkpoint.
              </p>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}

function buildFlow(tree: DeliverableTree) {
  const nodes: FlowNode<FlowData>[] = [];
  const edges: Edge[] = [];
  let row = 0;

  function walk(node: DeliverableNode, depth: number, parentId?: string) {
    const y = row * 92;
    row += 1;
    nodes.push({
      id: node.id,
      position: { x: depth * 280, y },
      data: {
        label: (
          <div className="min-w-48 rounded-lg border border-[#cfc8bd] bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#69707a]">
              {nodeTypeLabels[node.nodeType]}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#1f2328]">
              {node.label}
            </p>
          </div>
        ),
        nodeType: node.nodeType,
      },
      type: "default",
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
      });
    }

    node.children?.forEach((child) => walk(child, depth + 1, node.id));
  }

  tree.nodes.forEach((node) => walk(node, 0));

  return { nodes, edges };
}

function findNode(nodes: DeliverableNode[], nodeId: string): DeliverableNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const child = findNode(node.children ?? [], nodeId);
    if (child) {
      return child;
    }
  }

  return null;
}

function mapNodes(
  nodes: DeliverableNode[],
  nodeId: string,
  updater: (node: DeliverableNode) => DeliverableNode,
): DeliverableNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return updater(node);
    }

    return {
      ...node,
      children: node.children
        ? mapNodes(node.children, nodeId, updater)
        : node.children,
    };
  });
}

function removeNode(nodes: DeliverableNode[], nodeId: string): DeliverableNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: node.children ? removeNode(node.children, nodeId) : node.children,
    }));
}
