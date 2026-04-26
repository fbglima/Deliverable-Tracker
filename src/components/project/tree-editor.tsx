"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  Download,
  GitCompareArrows,
  GripVertical,
  LayoutGrid,
  ListTree,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import { saveSnapshot, updateProjectTree } from "@/app/actions";
import {
  calculateCounts,
  childOptions,
  countNodesByType,
  countTerminalsForNode,
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
  workspaceName: string;
};

type Density = "compact" | "comfortable" | "roomy";
type ViewMode = "rows" | "pivot" | "tree";

type VisibleRow = {
  node: DeliverableNode;
  depth: number;
  last: boolean;
  ancestorsLast: boolean[];
  pathText: string;
};

const densityVars: Record<Density, CSSProperties> = {
  compact: {
    "--row-h": "30px",
    "--row-px": "12px",
    "--row-fs": "12px",
    "--row-meta-fs": "10.5px",
  } as CSSProperties,
  comfortable: {
    "--row-h": "38px",
    "--row-px": "14px",
    "--row-fs": "13px",
    "--row-meta-fs": "11.5px",
  } as CSSProperties,
  roomy: {
    "--row-h": "48px",
    "--row-px": "18px",
    "--row-fs": "13.5px",
    "--row-meta-fs": "12px",
  } as CSSProperties,
};

export function TreeEditor({
  project,
  initialSnapshots,
  workspaceName,
}: TreeEditorProps) {
  const router = useRouter();
  const [tree, setTree] = useState<DeliverableTree>(project.tree_json);
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(getInitialOpenIds(project.tree_json.nodes)),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    tree.nodes[0]?.id ?? null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("rows");
  const [density, setDensity] = useState<Density>("comfortable");
  const [search, setSearch] = useState("");
  const [newChildType, setNewChildType] = useState<MatrixNodeType>("duration");
  const [newChildLabel, setNewChildLabel] = useState("");
  const [bulkLabels, setBulkLabels] = useState(":60\n:30\n:15\n:06");
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [snapshotName, setSnapshotName] = useState("Current");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [status, setStatus] = useState("Unsaved edits stay local until saved.");
  const [isPending, startTransition] = useTransition();

  const selectedNode = selectedNodeId
    ? findNode(tree.nodes, selectedNodeId)
    : null;
  const counts = calculateCounts(tree);
  const cuts = countNodesByType(tree, "duration");
  const ratios = countNodesByType(tree, "aspect_ratio");
  const availableChildTypes = selectedNode
    ? childOptions[selectedNode.nodeType]
    : (["creative_unit"] as MatrixNodeType[]);
  const activeChildType = availableChildTypes.includes(newChildType)
    ? newChildType
    : availableChildTypes[0] ?? "creative_unit";
  const rows = useMemo(() => flattenRows(tree.nodes, openIds), [tree, openIds]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => row.pathText.toLowerCase().includes(query));
  }, [rows, search]);
  const projectTitle = [project.client_name, project.name]
    .filter(Boolean)
    .join(" · ");

  function commitTree(nextTree: DeliverableTree) {
    setTree(nextTree);
    setStatus("Unsaved changes");
  }

  function toggleNode(node: DeliverableNode) {
    setSelectedNodeId(node.id);

    if (!node.children?.length) {
      return;
    }

    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
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
    setOpenIds((current) => new Set(current).add(selectedNodeId));
    setSelectedNodeId(child.id);
    setNewChildLabel("");
  }

  function addCreativeUnit() {
    const child = createNode("creative_unit", "Creative Unit 01");
    commitTree({ ...tree, nodes: [...tree.nodes, child] });
    setSelectedNodeId(child.id);
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
    setOpenIds((current) => new Set(current).add(selectedNodeId));
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
    <div className="dt-frame" style={densityVars[density]}>
      <TopBar
        projectName={project.name}
        snapshotCount={initialSnapshots.length}
        status={status}
        workspaceName={workspaceName}
      />
      <ProjectHeader
        creative={counts.creativeDeliverables}
        cuts={cuts}
        description={
          project.description ||
          "Build, revise, and snapshot the current working deliverables matrix."
        }
        ratios={ratios}
        terminals={counts.terminalFiles}
        title={projectTitle}
      />
      <Toolbar
        density={density}
        disabled={isPending}
        onAddCreativeUnit={addCreativeUnit}
        onDensity={setDensity}
        onSave={saveTree}
        onSearch={setSearch}
        onSnapshot={createSnapshot}
        onView={setViewMode}
        search={search}
        view={viewMode}
      />

      <main className="dt-canvas">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="dt-panel overflow-hidden">
            <MatrixHeader />
            <div>
              {filteredRows.map((row) => (
                <MatrixRow
                  isOpen={openIds.has(row.node.id)}
                  isSelected={selectedNodeId === row.node.id}
                  key={row.node.id}
                  onSelect={() => toggleNode(row.node)}
                  row={row}
                />
              ))}
            </div>
            <AddRow
              activeChildType={activeChildType}
              bulkLabels={bulkLabels}
              disabled={!availableChildTypes.length && Boolean(selectedNodeId)}
              isOpen={showBulkAdd}
              onBulkAdd={() => {
                bulkAdd();
                setShowBulkAdd(false);
              }}
              onBulkLabels={setBulkLabels}
              onChildType={setNewChildType}
              onToggle={() => setShowBulkAdd((value) => !value)}
              types={availableChildTypes.length ? availableChildTypes : ["creative_unit"]}
            />
          </div>

          <aside className="grid content-start gap-4">
            <BranchPanel
              activeChildType={activeChildType}
              availableChildTypes={availableChildTypes}
              newChildLabel={newChildLabel}
              onAddChild={addChild}
              onChildLabel={setNewChildLabel}
              onChildType={setNewChildType}
              onDelete={deleteSelected}
              onRename={renameSelected}
              selectedNode={selectedNode}
            />
            <SnapshotPanel
              isPending={isPending}
              onNotes={setSnapshotNotes}
              onSaveSnapshot={createSnapshot}
              onSnapshotName={setSnapshotName}
              snapshotName={snapshotName}
              snapshotNotes={snapshotNotes}
              snapshots={initialSnapshots}
              status={status}
            />
          </aside>
        </section>
      </main>
    </div>
  );
}

function TopBar({
  projectName,
  snapshotCount,
  status,
  workspaceName,
}: {
  projectName: string;
  snapshotCount: number;
  status: string;
  workspaceName: string;
}) {
  return (
    <div className="dt-topbar">
      <div className="dt-logo">D</div>
      <div className="dt-crumb">
        <span>{workspaceName}</span>
        <span className="sep">/</span>
        <b>{projectName}</b>
      </div>
      <div className="flex-1" />
      <div className="dt-snapstrip">
        <span className="dt-chip is-current">v{Math.max(snapshotCount, 1)} · current</span>
        <span className="opacity-50">·</span>
        <span>{status}</span>
      </div>
      <div className="h-[18px] w-px bg-[var(--line)]" />
      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#bd7c63] font-mono text-[10px] font-semibold text-white">
        FB
      </div>
    </div>
  );
}

function ProjectHeader({
  creative,
  cuts,
  description,
  ratios,
  terminals,
  title,
}: {
  creative: number;
  cuts: number;
  description: string;
  ratios: number;
  terminals: number;
  title: string;
}) {
  return (
    <header className="dt-projhead">
      <div>
        <div className="dt-eyebrow">Project · Campaign</div>
        <h1>{title}</h1>
        <div className="dt-sub max-w-[520px]">{description}</div>
      </div>
      <div className="dt-statgrid">
        <Stat label="Creative" value={creative} />
        <Stat label="Cuts" value={cuts} />
        <Stat label="Ratios" value={ratios} />
        <Stat label="Terminal files" value={terminals} />
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="dt-stat">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function Toolbar({
  density,
  disabled,
  onAddCreativeUnit,
  onDensity,
  onSave,
  onSearch,
  onSnapshot,
  onView,
  search,
  view,
}: {
  density: Density;
  disabled: boolean;
  onAddCreativeUnit: () => void;
  onDensity: (density: Density) => void;
  onSave: () => void;
  onSearch: (search: string) => void;
  onSnapshot: () => void;
  onView: (view: ViewMode) => void;
  search: string;
  view: ViewMode;
}) {
  return (
    <div className="dt-toolbar">
      <div className="dt-segment">
        <button
          className={view === "rows" ? "is-active" : ""}
          onClick={() => onView("rows")}
          type="button"
        >
          <Table2 className="h-3.5 w-3.5" /> Rows
        </button>
        <button
          className={view === "pivot" ? "is-active" : ""}
          onClick={() => onView("pivot")}
          type="button"
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Pivot
        </button>
        <button
          className={view === "tree" ? "is-active" : ""}
          onClick={() => onView("tree")}
          type="button"
        >
          <ListTree className="h-3.5 w-3.5" /> Tree
        </button>
      </div>

      <div className="dt-segment" title="Density">
        {(["compact", "comfortable", "roomy"] as Density[]).map((item) => (
          <button
            className={density === item ? "is-active" : ""}
            key={item}
            onClick={() => onDensity(item)}
            title={item}
            type="button"
          >
            <DensityGlyph density={item} />
          </button>
        ))}
      </div>

      <label className="dt-search">
        <Search className="h-3.5 w-3.5" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--ink-4)]"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Filter deliverables..."
          value={search}
        />
        <span className="mono text-[10px] opacity-60">⌘K</span>
      </label>

      <div className="flex-1" />
      <button className="dt-btn" disabled type="button">
        <GitCompareArrows className="h-3.5 w-3.5" /> Compare snapshots
      </button>
      <button className="dt-btn" disabled type="button">
        <Bot className="h-3.5 w-3.5" /> AI assist
      </button>
      <button className="dt-btn" disabled type="button">
        <Download className="h-3.5 w-3.5" /> Export
      </button>
      <button className="dt-btn" disabled={disabled} onClick={onSnapshot} type="button">
        <Sparkles className="h-3.5 w-3.5" /> Snapshot
      </button>
      <button className="dt-btn" disabled={disabled} onClick={onSave} type="button">
        <Save className="h-3.5 w-3.5" /> Save
      </button>
      <button className="dt-btn primary" onClick={onAddCreativeUnit} type="button">
        <Plus className="h-3.5 w-3.5" /> Add creative unit
      </button>
    </div>
  );
}

function DensityGlyph({ density }: { density: Density }) {
  const gap = density === "compact" ? 1 : density === "comfortable" ? 2 : 3;

  return (
    <span className="inline-flex flex-col justify-center" style={{ gap }}>
      <span className="h-px w-3 bg-current" />
      <span className="h-px w-3 bg-current" />
      <span className="h-px w-3 bg-current" />
    </span>
  );
}

function MatrixHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px_90px_72px_72px_28px] items-center border-b border-[var(--line)] bg-[var(--bg-tint)] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)] mono">
      <div>Deliverable</div>
      <div className="text-right">Type</div>
      <div className="text-right">Codec</div>
      <div className="text-right">Files</div>
      <div className="text-right">Fan-out</div>
      <div />
    </div>
  );
}

function MatrixRow({
  isOpen,
  isSelected,
  onSelect,
  row,
}: {
  isOpen: boolean;
  isSelected: boolean;
  onSelect: () => void;
  row: VisibleRow;
}) {
  const { node } = row;
  const terminalCount = countTerminalsForNode(node);
  const kind = rowKind(node.nodeType);
  const hasChildren = Boolean(node.children?.length);

  return (
    <button
      className="group grid w-full grid-cols-[minmax(0,1fr)_110px_90px_72px_72px_28px] items-center border-b border-[var(--line-faint)] bg-transparent py-0 pr-[var(--row-px)] pl-2 text-left text-[var(--ink-1)] transition hover:bg-[var(--bg-subtle)]"
      onClick={onSelect}
      style={{
        minHeight: "var(--row-h)",
        background: isSelected
          ? "var(--accent-tint)"
          : node.nodeType === "creative_unit"
            ? "var(--bg-panel)"
            : undefined,
        fontSize: "var(--row-fs)",
      }}
      type="button"
    >
      <div className="flex min-w-0 items-center" style={{ height: "var(--row-h)" }}>
        <IndentRail ancestorsLast={row.ancestorsLast} depth={row.depth} last={row.last} />
        <span className="flex w-[18px] shrink-0 justify-center">
          {hasChildren ? (
            <ChevronRight
              className="h-3 w-3 text-[var(--ink-3)] transition-transform duration-200"
              style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-4)]" />
          )}
        </span>
        <GripVertical className="ml-1 mr-2 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] opacity-0 transition group-hover:opacity-70" />
        <TypeTag kind={kind} />
        <span
          className={`ml-2 min-w-0 truncate ${
            node.nodeType === "output_format" ? "mono" : ""
          }`}
          style={{
            fontWeight: node.nodeType === "creative_unit" ? 600 : 450,
            letterSpacing: node.nodeType === "creative_unit" ? "-0.005em" : 0,
          }}
        >
          {node.label}
        </span>
        {node.nodeType === "creative_unit" && row.depth === 0 ? (
          <span className="mono ml-2 inline-flex h-[18px] items-center rounded-[var(--r-sm)] border border-dashed border-[var(--accent)] px-1.5 text-[10px] font-medium text-[var(--accent-ink)]">
            current
          </span>
        ) : null}
      </div>
      <div className="mono text-right text-[length:var(--row-meta-fs)] text-[var(--ink-3)]">
        {metaType(node.nodeType)}
      </div>
      <div className="mono text-right text-[length:var(--row-meta-fs)] text-[var(--ink-2)]">
        {node.nodeType === "output_format" ? codecLabel(node.label) : ""}
      </div>
      <div className="text-right">
        {terminalCount > 0 ? (
          <FanBadge count={terminalCount} tone={node.nodeType === "creative_unit" ? "ink" : "default"} />
        ) : null}
      </div>
      <div className="mono text-right text-[11px] text-[var(--ink-3)]">
        {node.nodeType === "aspect_ratio" ? `× ${terminalCount}` : node.nodeType === "output_format" ? "—" : ""}
      </div>
      <div className="flex justify-end text-[var(--ink-4)] opacity-0 transition group-hover:opacity-100">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

function IndentRail({
  ancestorsLast,
  depth,
  last,
}: {
  ancestorsLast: boolean[];
  depth: number;
  last: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-stretch"
      style={{ height: "var(--row-h)" }}
    >
      {Array.from({ length: depth }).map((_, index) => {
        const isConnector = index === depth - 1;
        const ancestorIsLast = ancestorsLast[index];

        return (
          <span className="relative w-4" key={index}>
            {!isConnector && !ancestorIsLast ? (
              <span className="absolute bottom-0 left-0 top-0 border-l border-dashed border-[var(--line)]" />
            ) : null}
            {isConnector ? (
              <svg
                className="absolute inset-0 text-[var(--line-strong)]"
                height="100%"
                preserveAspectRatio="none"
                viewBox="0 0 16 100"
                width="16"
              >
                <line
                  stroke="currentColor"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2={last ? 50 : 100}
                />
                <line
                  stroke="currentColor"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  x1="0"
                  x2="11"
                  y1="50"
                  y2="50"
                />
              </svg>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function TypeTag({ kind }: { kind: "unit" | "cut" | "ratio" | "file" | "platform" | "variant" }) {
  const label = {
    unit: "UNIT",
    cut: "CUT",
    ratio: "RATIO",
    file: "FILE",
    platform: "PLAT",
    variant: "VAR",
  }[kind];

  return (
    <span
      className="mono inline-flex h-[18px] shrink-0 items-center rounded-[var(--r-sm)] border px-1.5 text-[9.5px] font-medium tracking-[0.06em]"
      style={{
        borderColor: kind === "unit" ? "var(--accent-soft)" : "var(--line-strong)",
        color: kind === "unit" ? "var(--accent-ink)" : "var(--ink-3)",
      }}
    >
      {label}
    </span>
  );
}

function FanBadge({
  count,
  tone,
}: {
  count: number;
  tone: "default" | "ink";
}) {
  return (
    <span
      className="mono tnum inline-flex h-5 min-w-[26px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium"
      style={{
        background: tone === "ink" ? "var(--ink-1)" : "var(--bg-subtle)",
        color: tone === "ink" ? "var(--bg-panel)" : "var(--ink-2)",
      }}
    >
      {count}
    </span>
  );
}

function AddRow({
  activeChildType,
  bulkLabels,
  disabled,
  isOpen,
  onBulkAdd,
  onBulkLabels,
  onChildType,
  onToggle,
  types,
}: {
  activeChildType: MatrixNodeType;
  bulkLabels: string;
  disabled: boolean;
  isOpen: boolean;
  onBulkAdd: () => void;
  onBulkLabels: (value: string) => void;
  onChildType: (type: MatrixNodeType) => void;
  onToggle: () => void;
  types: MatrixNodeType[];
}) {
  return (
    <div className="border-t border-[var(--line-faint)] bg-[var(--bg-tint)]">
      <button
        className="grid w-full grid-cols-[minmax(0,1fr)_110px_90px_72px_72px_28px] items-center px-[var(--row-px)] py-0 text-left text-[var(--ink-3)]"
        disabled={disabled}
        onClick={onToggle}
        style={{ minHeight: "var(--row-h)" }}
        type="button"
      >
        <div className="flex items-center gap-2 pl-2">
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[12.5px]">
            Add creative unit, or paste a brief...
          </span>
          <span className="flex-1" />
          <span className="mono text-[10px] opacity-50">⌘⏎</span>
        </div>
      </button>
      {isOpen ? (
        <div className="grid gap-3 border-t border-[var(--line)] p-4">
          <label className="dt-field">
            Add as
            <select
              className="dt-input"
              onChange={(event) => onChildType(event.target.value as MatrixNodeType)}
              value={activeChildType}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {nodeTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="dt-input min-h-28 resize-y mono"
            onChange={(event) => onBulkLabels(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                onBulkAdd();
              }
            }}
            value={bulkLabels}
          />
          <button className="dt-btn primary w-fit" onClick={onBulkAdd} type="button">
            Add rows
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BranchPanel({
  activeChildType,
  availableChildTypes,
  newChildLabel,
  onAddChild,
  onChildLabel,
  onChildType,
  onDelete,
  onRename,
  selectedNode,
}: {
  activeChildType: MatrixNodeType;
  availableChildTypes: MatrixNodeType[];
  newChildLabel: string;
  onAddChild: () => void;
  onChildLabel: (label: string) => void;
  onChildType: (type: MatrixNodeType) => void;
  onDelete: () => void;
  onRename: (label: string) => void;
  selectedNode: DeliverableNode | null;
}) {
  return (
    <section className="dt-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Branch inspector</h2>
        <span className="dt-eyebrow">JSON tree</span>
      </div>

      {selectedNode ? (
        <div className="mt-4 grid gap-3">
          <p className="dt-sub">{nodeTypeLabels[selectedNode.nodeType]}</p>
          <label className="dt-field">
            Label
            <input
              className="dt-input"
              onChange={(event) => onRename(event.target.value)}
              value={selectedNode.label}
            />
          </label>

          <label className="dt-field">
            Child level
            <select
              className="dt-input"
              disabled={!availableChildTypes.length}
              onChange={(event) => onChildType(event.target.value as MatrixNodeType)}
              value={activeChildType}
            >
              {availableChildTypes.map((type) => (
                <option key={type} value={type}>
                  {nodeTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="dt-field">
            New branch label
            <input
              className="dt-input"
              onChange={(event) => onChildLabel(event.target.value)}
              placeholder={presetValues[activeChildType][0]}
              value={newChildLabel}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="dt-btn primary justify-center"
              disabled={!availableChildTypes.length}
              onClick={onAddChild}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
            <button
              className="dt-btn justify-center text-[#a33127]"
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      ) : (
        <p className="dt-sub mt-4">Select a row to rename it or add child rows.</p>
      )}
    </section>
  );
}

function SnapshotPanel({
  isPending,
  onNotes,
  onSaveSnapshot,
  onSnapshotName,
  snapshotName,
  snapshotNotes,
  snapshots,
  status,
}: {
  isPending: boolean;
  onNotes: (notes: string) => void;
  onSaveSnapshot: () => void;
  onSnapshotName: (name: string) => void;
  snapshotName: string;
  snapshotNotes: string;
  snapshots: MatrixSnapshot[];
  status: string;
}) {
  return (
    <section className="dt-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Snapshots</h2>
        <span className="dt-chip">{isPending ? "saving" : status}</span>
      </div>
      <div className="mt-4 grid gap-3">
        <input
          className="dt-input"
          onChange={(event) => onSnapshotName(event.target.value)}
          value={snapshotName}
        />
        <textarea
          className="dt-input min-h-20"
          onChange={(event) => onNotes(event.target.value)}
          placeholder="Notes"
          value={snapshotNotes}
        />
        <button
          className="dt-btn primary w-fit"
          disabled={isPending}
          onClick={onSaveSnapshot}
          type="button"
        >
          Save snapshot
        </button>
      </div>

      <div className="mt-5 grid gap-2">
        {snapshots.length ? (
          snapshots.map((snapshot) => (
            <div
              className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-app)] p-3"
              key={snapshot.id}
            >
              <p className="text-sm font-medium">{snapshot.name}</p>
              <p className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                {new Date(snapshot.created_at).toLocaleString()}
              </p>
              {snapshot.notes ? (
                <p className="dt-sub mt-2">{snapshot.notes}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="dt-sub">No snapshots yet.</p>
        )}
      </div>
    </section>
  );
}

function flattenRows(nodes: DeliverableNode[], openIds: Set<string>) {
  const rows: VisibleRow[] = [];

  function walk(
    node: DeliverableNode,
    depth: number,
    index: number,
    siblings: DeliverableNode[],
    ancestorsLast: boolean[],
    path: string[],
  ) {
    const last = index === siblings.length - 1;
    const nextPath = [...path, node.label];
    rows.push({
      node,
      depth,
      last,
      ancestorsLast,
      pathText: nextPath.join(" / "),
    });

    if (openIds.has(node.id)) {
      node.children?.forEach((child, childIndex, childSiblings) =>
        walk(child, depth + 1, childIndex, childSiblings, [...ancestorsLast, last], nextPath),
      );
    }
  }

  nodes.forEach((node, index, siblings) => walk(node, 0, index, siblings, [], []));

  return rows;
}

function getInitialOpenIds(nodes: DeliverableNode[]) {
  const ids: string[] = [];

  function walk(node: DeliverableNode, depth: number) {
    if (depth < 2 && node.children?.length) {
      ids.push(node.id);
    }

    node.children?.forEach((child) => walk(child, depth + 1));
  }

  nodes.forEach((node) => walk(node, 0));

  return ids;
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

function rowKind(nodeType: MatrixNodeType) {
  const map = {
    creative_unit: "unit",
    duration: "cut",
    aspect_ratio: "ratio",
    platform: "platform",
    technical_variant: "variant",
    output_format: "file",
  } as const;

  return map[nodeType];
}

function metaType(nodeType: MatrixNodeType) {
  const map: Record<MatrixNodeType, string> = {
    creative_unit: "",
    duration: "duration",
    aspect_ratio: "ratio",
    platform: "platform",
    technical_variant: "variant",
    output_format: "format",
  };

  return map[nodeType];
}

function codecLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("prores")) {
    return "ProRes";
  }
  if (normalized.includes("h264") || normalized.includes("h.264")) {
    return "H.264";
  }
  if (normalized.includes("webm")) {
    return "WebM";
  }
  if (normalized.includes("mxf")) {
    return "MXF";
  }

  return "Custom";
}
