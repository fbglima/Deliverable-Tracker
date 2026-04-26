"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { saveSnapshot, updateProjectTree } from "@/app/actions";
import {
  calculateCounts,
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
type AddVersionsTarget = "selected" | "all";

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
  const [density, setDensity] = useState<Density>("comfortable");
  const [search, setSearch] = useState("");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);
  const [showCreativeUnitModal, setShowCreativeUnitModal] = useState(false);
  const [creativeUnitName, setCreativeUnitName] = useState("");
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [versionsType, setVersionsType] = useState<MatrixNodeType>("duration");
  const [versionsTarget, setVersionsTarget] =
    useState<AddVersionsTarget>("selected");
  const [selectedPresetLabels, setSelectedPresetLabels] = useState<string[]>([
    ":60",
    ":30",
    ":15",
    ":06",
  ]);
  const [customVersionLabels, setCustomVersionLabels] = useState("");
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
  const defaultOutputFormats =
    tree.defaultOutputFormats?.length
      ? tree.defaultOutputFormats
      : ["H264 MP4", "ProRes MOV"];
  const autoApplyOutputFormats = tree.autoApplyOutputFormats ?? true;

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

  function renameNode(nodeId: string, label: string) {
    commitTree({
      ...tree,
      nodes: mapNodes(tree.nodes, nodeId, (node) => ({
        ...node,
        label,
      })),
    });
  }

  function startInlineEdit(node: DeliverableNode) {
    setEditingNodeId(node.id);
    setEditingLabel(node.label);
  }

  function commitInlineEdit() {
    if (editingNodeId && editingLabel.trim()) {
      renameNode(editingNodeId, editingLabel.trim());
    }
    setEditingNodeId(null);
    setEditingLabel("");
  }

  function addCreativeUnit() {
    const label = creativeUnitName.trim() || "Creative Unit 01";
    const child = createNode("creative_unit", label);
    commitTree({ ...tree, nodes: [...tree.nodes, child] });
    setSelectedNodeId(child.id);
    setOpenIds((current) => new Set(current).add(child.id));
    setCreativeUnitName("");
    setShowCreativeUnitModal(false);
  }

  function deleteNode(nodeId: string) {
    commitTree({ ...tree, nodes: removeNode(tree.nodes, nodeId) });
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    setOpenMenuNodeId(null);
  }

  function openAddVersions(nodeId?: string) {
    if (nodeId) {
      setSelectedNodeId(nodeId);
    }
    setOpenMenuNodeId(null);
    if (!nodeId && !selectedNodeId) {
      setVersionsTarget("all");
    }
    setSelectedPresetLabels(presetValues[versionsType]);
    setCustomVersionLabels("");
    setShowVersionsModal(true);
  }

  function addVersions() {
    const labels = [
      ...selectedPresetLabels,
      ...customVersionLabels
        .split(/\n|,/)
        .map((label) => label.trim())
        .filter(Boolean),
    ];
    const uniqueLabels = Array.from(new Set(labels));

    if (!uniqueLabels.length) {
      return;
    }

    const selectedCreativeId = selectedNodeId
      ? findAncestorId(tree.nodes, selectedNodeId, "creative_unit")
      : null;

    const nextNodes = addVersionNodes(tree.nodes, {
      autoApplyOutputFormats,
      defaultOutputFormats,
      labels: uniqueLabels,
      selectedCreativeId,
      target: versionsTarget,
      type: versionsType,
    });

    commitTree({ ...tree, nodes: nextNodes });
    setOpenIds((current) => {
      const next = new Set(current);
      collectOpenIdsForType(nextNodes, versionsType, next);
      return next;
    });
    setShowVersionsModal(false);
  }

  function updateOutputDefaults(formats: string[], autoApply: boolean) {
    commitTree({
      ...tree,
      autoApplyOutputFormats: autoApply,
      defaultOutputFormats: formats,
    });
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
        onDensity={setDensity}
        onSave={saveTree}
        onSearch={setSearch}
        onSnapshot={createSnapshot}
        search={search}
      />

      <main className="dt-canvas">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="dt-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg-panel)] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Deliverables</h2>
                <p className="dt-sub mt-0.5">
                  Click a label to rename it. Use row menus to add versions or delete forks.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="dt-btn"
                  onClick={() => openAddVersions()}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" /> Add versions
                </button>
                <button
                  className="dt-btn primary"
                  onClick={() => setShowCreativeUnitModal(true)}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" /> Add creative unit
                </button>
              </div>
            </div>
            <MatrixHeader />
            <div>
              {filteredRows.map((row) => (
                <MatrixRow
                  editingLabel={editingLabel}
                  editingNodeId={editingNodeId}
                  isOpen={openIds.has(row.node.id)}
                  isSelected={selectedNodeId === row.node.id}
                  key={row.node.id}
                  onCommitEdit={commitInlineEdit}
                  onDelete={() => deleteNode(row.node.id)}
                  onEditLabel={setEditingLabel}
                  onMenu={() =>
                    setOpenMenuNodeId((current) =>
                      current === row.node.id ? null : row.node.id,
                    )
                  }
                  onOpenAddVersions={() => openAddVersions(row.node.id)}
                  onSelect={() => toggleNode(row.node)}
                  onStartEdit={() => {
                    setOpenMenuNodeId(null);
                    startInlineEdit(row.node);
                  }}
                  openMenu={openMenuNodeId === row.node.id}
                  row={row}
                />
              ))}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <ProjectDefaultsPanel
              autoApply={autoApplyOutputFormats}
              formats={defaultOutputFormats}
              onChange={updateOutputDefaults}
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

      {showCreativeUnitModal ? (
        <Modal
          onClose={() => setShowCreativeUnitModal(false)}
          title="Add creative unit"
        >
          <p className="dt-sub">
            Give this unit a working name. You can rename it inline later.
          </p>
          <label className="dt-field mt-4">
            Creative unit name
            <input
              autoFocus
              className="dt-input"
              onChange={(event) => setCreativeUnitName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addCreativeUnit();
                }
              }}
              placeholder="Creative Unit 01"
              value={creativeUnitName}
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="dt-btn"
              onClick={() => setShowCreativeUnitModal(false)}
              type="button"
            >
              Cancel
            </button>
            <button className="dt-btn primary" onClick={addCreativeUnit} type="button">
              Add unit
            </button>
          </div>
        </Modal>
      ) : null}

      {showVersionsModal ? (
        <AddVersionsModal
          customLabels={customVersionLabels}
          onClose={() => setShowVersionsModal(false)}
          onCustomLabels={setCustomVersionLabels}
          onPresetLabels={setSelectedPresetLabels}
          onSubmit={addVersions}
          onTarget={setVersionsTarget}
          onType={(type) => {
            setVersionsType(type);
            setSelectedPresetLabels(presetValues[type]);
          }}
          presetLabels={selectedPresetLabels}
          selectedCreativeName={
            selectedNode
              ? findAncestorLabel(tree.nodes, selectedNode.id, "creative_unit")
              : null
          }
          target={versionsTarget}
          type={versionsType}
        />
      ) : null}
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
  onDensity,
  onSave,
  onSearch,
  onSnapshot,
  search,
}: {
  density: Density;
  disabled: boolean;
  onDensity: (density: Density) => void;
  onSave: () => void;
  onSearch: (search: string) => void;
  onSnapshot: () => void;
  search: string;
}) {
  return (
    <div className="dt-toolbar">
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
      <button className="dt-btn" disabled={disabled} onClick={onSnapshot} type="button">
        <Sparkles className="h-3.5 w-3.5" /> Snapshot
      </button>
      <button className="dt-btn" disabled={disabled} onClick={onSave} type="button">
        <Save className="h-3.5 w-3.5" /> Save
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
  editingLabel,
  editingNodeId,
  isOpen,
  isSelected,
  onCommitEdit,
  onDelete,
  onEditLabel,
  onMenu,
  onOpenAddVersions,
  onSelect,
  onStartEdit,
  openMenu,
  row,
}: {
  editingLabel: string;
  editingNodeId: string | null;
  isOpen: boolean;
  isSelected: boolean;
  onCommitEdit: () => void;
  onDelete: () => void;
  onEditLabel: (label: string) => void;
  onMenu: () => void;
  onOpenAddVersions: () => void;
  onSelect: () => void;
  onStartEdit: () => void;
  openMenu: boolean;
  row: VisibleRow;
}) {
  const { node } = row;
  const terminalCount = countTerminalsForNode(node);
  const kind = rowKind(node.nodeType);
  const hasChildren = Boolean(node.children?.length);

  const isEditing = editingNodeId === node.id;

  return (
    <div
      className="group relative grid w-full grid-cols-[minmax(0,1fr)_110px_90px_72px_72px_28px] items-center border-b border-[var(--line-faint)] bg-transparent py-0 pr-[var(--row-px)] pl-2 text-left text-[var(--ink-1)] transition hover:bg-[var(--bg-subtle)]"
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
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 items-center" style={{ height: "var(--row-h)" }}>
        <IndentRail ancestorsLast={row.ancestorsLast} depth={row.depth} last={row.last} />
        <button
          className="flex w-[18px] shrink-0 justify-center"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          type="button"
        >
          {hasChildren ? (
            <ChevronRight
              className="h-3 w-3 text-[var(--ink-3)] transition-transform duration-200"
              style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-4)]" />
          )}
        </button>
        <TypeTag kind={kind} />
        {isEditing ? (
          <input
            autoFocus
            className={`dt-input ml-2 h-7 min-w-0 flex-1 py-0 ${
              node.nodeType === "output_format" ? "mono" : ""
            }`}
            onBlur={onCommitEdit}
            onChange={(event) => onEditLabel(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCommitEdit();
              }
              if (event.key === "Escape") {
                onEditLabel(node.label);
                onCommitEdit();
              }
            }}
            value={editingLabel}
          />
        ) : (
          <button
            className={`ml-2 min-w-0 truncate text-left hover:underline ${
              node.nodeType === "output_format" ? "mono" : ""
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit();
            }}
            style={{
              fontWeight: node.nodeType === "creative_unit" ? 600 : 450,
              letterSpacing: node.nodeType === "creative_unit" ? "-0.005em" : 0,
            }}
            type="button"
          >
            {node.label}
          </button>
        )}
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
        <button
          className="rounded-[var(--r-sm)] p-1 hover:bg-[var(--bg-panel)] hover:text-[var(--ink-1)]"
          onClick={(event) => {
            event.stopPropagation();
            onMenu();
          }}
          type="button"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      {openMenu ? (
        <div
          className="absolute right-5 top-[calc(100%-4px)] z-20 w-44 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-elevated)] py-1 text-sm shadow-[var(--shadow-pop)]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-subtle)]"
            onClick={onStartEdit}
            type="button"
          >
            Rename
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-subtle)]"
            onClick={onOpenAddVersions}
            type="button"
          >
            Add versions
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#a33127] hover:bg-[#fff5f3]"
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete row
          </button>
        </div>
      ) : null}
    </div>
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

function ProjectDefaultsPanel({
  autoApply,
  formats,
  onChange,
}: {
  autoApply: boolean;
  formats: string[];
  onChange: (formats: string[], autoApply: boolean) => void;
}) {
  const [draftFormats, setDraftFormats] = useState(formats.join("\n"));

  function saveDefaults(nextAutoApply = autoApply) {
    const nextFormats = draftFormats
      .split(/\n|,/)
      .map((format) => format.trim())
      .filter(Boolean);
    onChange(nextFormats.length ? nextFormats : ["H264 MP4", "ProRes MOV"], nextAutoApply);
  }

  return (
    <section className="dt-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Output defaults</h2>
        <span className="dt-eyebrow">Project</span>
      </div>
      <p className="dt-sub mt-2">
        These formats populate new aspect-ratio branches when auto-populate is on.
      </p>
      <label className="dt-field mt-4">
        Terminal output formats
        <textarea
          className="dt-input min-h-24 mono"
          onBlur={() => saveDefaults()}
          onChange={(event) => setDraftFormats(event.target.value)}
          value={draftFormats}
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm text-[var(--ink-2)]">
        <input
          checked={autoApply}
          className="mt-1"
          onChange={(event) => saveDefaults(event.target.checked)}
          type="checkbox"
        />
        Auto-populate new aspect ratios with these output formats.
      </label>
      <button className="dt-btn mt-4" onClick={() => saveDefaults()} type="button">
        Save defaults
      </button>
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

function Modal({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,21,0.28)] p-4">
      <div className="dt-panel w-full max-w-lg bg-[var(--bg-panel)] p-5 shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="dt-btn h-7 px-2"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function AddVersionsModal({
  customLabels,
  onClose,
  onCustomLabels,
  onPresetLabels,
  onSubmit,
  onTarget,
  onType,
  presetLabels,
  selectedCreativeName,
  target,
  type,
}: {
  customLabels: string;
  onClose: () => void;
  onCustomLabels: (labels: string) => void;
  onPresetLabels: (labels: string[]) => void;
  onSubmit: () => void;
  onTarget: (target: AddVersionsTarget) => void;
  onType: (type: MatrixNodeType) => void;
  presetLabels: string[];
  selectedCreativeName: string | null;
  target: AddVersionsTarget;
  type: MatrixNodeType;
}) {
  const addableTypes: MatrixNodeType[] = [
    "duration",
    "aspect_ratio",
    "platform",
    "technical_variant",
    "output_format",
  ];
  const presets = presetValues[type];

  function togglePreset(label: string) {
    if (presetLabels.includes(label)) {
      onPresetLabels(presetLabels.filter((item) => item !== label));
    } else {
      onPresetLabels([...presetLabels, label]);
    }
  }

  return (
    <Modal onClose={onClose} title="Add versions">
      <div className="grid gap-4">
        <label className="dt-field">
          Version type
          <select
            className="dt-input"
            onChange={(event) => onType(event.target.value as MatrixNodeType)}
            value={type}
          >
            {addableTypes.map((item) => (
              <option key={item} value={item}>
                {nodeTypeLabels[item]}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="dt-eyebrow mb-2">Presets</div>
          <div className="flex flex-wrap gap-2">
            {presets.map((label) => (
              <label
                className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1 text-sm"
                key={label}
              >
                <input
                  checked={presetLabels.includes(label)}
                  onChange={() => togglePreset(label)}
                  type="checkbox"
                />
                <span className="mono">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="dt-field">
          Custom values one per line
          <textarea
            className="dt-input min-h-20 mono"
            onChange={(event) => onCustomLabels(event.target.value)}
            placeholder={type === "duration" ? ":20\n:45" : "Custom"}
            value={customLabels}
          />
        </label>

        <div>
          <div className="dt-eyebrow mb-2">Apply to</div>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input
                checked={target === "selected"}
                disabled={!selectedCreativeName}
                onChange={() => onTarget("selected")}
                type="radio"
              />
              Selected creative unit
              {selectedCreativeName ? (
                <span className="dt-chip">{selectedCreativeName}</span>
              ) : (
                <span className="text-[var(--ink-4)]">select a row first</span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input
                checked={target === "all"}
                onChange={() => onTarget("all")}
                type="radio"
              />
              All creative units
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="dt-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="dt-btn primary" onClick={onSubmit} type="button">
            Add versions
          </button>
        </div>
      </div>
    </Modal>
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

function collectOpenIdsForType(
  nodes: DeliverableNode[],
  _nodeType: MatrixNodeType,
  ids: Set<string>,
) {
  nodes.forEach((node) => {
    if (node.children?.length) {
      ids.add(node.id);
      collectOpenIdsForType(node.children, _nodeType, ids);
    }
  });
}

function addVersionNodes(
  nodes: DeliverableNode[],
  options: {
    autoApplyOutputFormats: boolean;
    defaultOutputFormats: string[];
    labels: string[];
    selectedCreativeId: string | null;
    target: AddVersionsTarget;
    type: MatrixNodeType;
  },
): DeliverableNode[] {
  return nodes.map((node) => {
    const inScope =
      options.target === "all" ||
      node.id === options.selectedCreativeId ||
      containsNode(node.children ?? [], options.selectedCreativeId);
    const shouldAddHere = inScope && canAddVersionToParent(node.nodeType, options.type);
    const existingChildren = node.children ?? [];
    const addedChildren = shouldAddHere
      ? options.labels
          .filter(
            (label) =>
              !existingChildren.some(
                (child) => child.nodeType === options.type && child.label === label,
              ),
          )
          .map((label) =>
            createVersionNode(
              options.type,
              label,
              options.defaultOutputFormats,
              options.autoApplyOutputFormats,
            ),
          )
      : [];

    return {
      ...node,
      children: [
        ...existingChildren.map((child) =>
          addVersionNodes([child], options)[0],
        ),
        ...addedChildren,
      ],
    };
  });
}

function createVersionNode(
  type: MatrixNodeType,
  label: string,
  defaultOutputFormats: string[],
  autoApplyOutputFormats: boolean,
) {
  const shouldAttachOutputs =
    autoApplyOutputFormats &&
    ["aspect_ratio", "platform", "technical_variant"].includes(type);
  const children = shouldAttachOutputs
    ? defaultOutputFormats.map((format) => createNode("output_format", format))
    : [];

  return createNode(type, label, children);
}

function canAddVersionToParent(
  parentType: MatrixNodeType,
  childType: MatrixNodeType,
) {
  if (childType === "duration") {
    return parentType === "creative_unit";
  }
  if (childType === "aspect_ratio") {
    return parentType === "duration";
  }
  if (childType === "platform") {
    return parentType === "aspect_ratio";
  }
  if (childType === "technical_variant") {
    return parentType === "aspect_ratio" || parentType === "platform";
  }
  if (childType === "output_format") {
    return (
      parentType === "aspect_ratio" ||
      parentType === "platform" ||
      parentType === "technical_variant"
    );
  }

  return false;
}

function containsNode(nodes: DeliverableNode[], nodeId: string | null): boolean {
  if (!nodeId) {
    return false;
  }

  return nodes.some(
    (node) => node.id === nodeId || containsNode(node.children ?? [], nodeId),
  );
}

function findAncestorId(
  nodes: DeliverableNode[],
  nodeId: string,
  ancestorType: MatrixNodeType,
) {
  const result = findAncestor(nodes, nodeId, ancestorType);
  return result?.id ?? null;
}

function findAncestorLabel(
  nodes: DeliverableNode[],
  nodeId: string,
  ancestorType: MatrixNodeType,
) {
  const result = findAncestor(nodes, nodeId, ancestorType);
  return result?.label ?? null;
}

function findAncestor(
  nodes: DeliverableNode[],
  nodeId: string,
  ancestorType: MatrixNodeType,
  ancestors: DeliverableNode[] = [],
): DeliverableNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return [...ancestors, node]
        .reverse()
        .find((ancestor) => ancestor.nodeType === ancestorType) ?? null;
    }

    const result = findAncestor(
      node.children ?? [],
      nodeId,
      ancestorType,
      [...ancestors, node],
    );
    if (result) {
      return result;
    }
  }

  return null;
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
