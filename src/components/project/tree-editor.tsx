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
  Clock3,
  FileText,
  Languages,
  LayoutGrid,
  ListTree,
  MoreHorizontal,
  Monitor,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import { saveSnapshot, updateProjectTree } from "@/app/actions";
import {
  calculateCounts,
  countNodesByType,
  countTerminalsForNode,
  createNode,
  defaultEnabledForkTypes,
  nodeTypeLabels,
  presetValues,
} from "@/lib/tree";
import type {
  DeliverableNode,
  DeliverableTree,
  FilenameCase,
  FilenameSeparator,
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
type ViewMode = "rows" | "pivot" | "tree";

type VisibleRow = {
  node: DeliverableNode;
  depth: number;
  last: boolean;
  ancestorsLast: boolean[];
  pathIds: string[];
  pathLabels: string[];
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

const forkTypeOrder: MatrixNodeType[] = [
  "duration",
  "aspect_ratio",
  "platform",
  "localization",
  "technical_variant",
];

const taxonomyOptions: Array<{
  type: MatrixNodeType;
  example: string;
  description: string;
}> = [
  {
    type: "duration",
    example: ":30",
    description: "Cuts, lengths, and alternates like :30, :15, or cutdown.",
  },
  {
    type: "aspect_ratio",
    example: "16x9",
    description: "Placement shapes like 16x9, 9x16, 1x1, or 4x5.",
  },
  {
    type: "platform",
    example: "TikTok",
    description: "Channel or destination forks such as TikTok or YouTube.",
  },
  {
    type: "localization",
    example: "LATAM",
    description: "Markets, languages, regions, or locale-specific copy.",
  },
  {
    type: "technical_variant",
    example: "Captioned",
    description: "Generic, captioned, clean, textless, slate, or legal variants.",
  },
];

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
  const [viewMode, setViewMode] = useState<ViewMode>("rows");
  const [search, setSearch] = useState("");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [hoveredPathIds, setHoveredPathIds] = useState<string[]>([]);
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);
  const [showCreativeUnitModal, setShowCreativeUnitModal] = useState(false);
  const [creativeUnitName, setCreativeUnitName] = useState("");
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [versionSourceNodeId, setVersionSourceNodeId] = useState<string | null>(
    null,
  );
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

  const versionSourceNode = versionSourceNodeId
    ? findNode(tree.nodes, versionSourceNodeId)
    : null;
  const counts = calculateCounts(tree);
  const cuts = countNodesByType(tree, "duration");
  const ratios = countNodesByType(tree, "aspect_ratio");
  const rows = useMemo(() => flattenRows(tree.nodes, openIds), [tree, openIds]);
  const hoveredNodeId = hoveredPathIds[hoveredPathIds.length - 1] ?? null;
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
  const filenameCase = tree.filenameCase ?? "lower";
  const filenameSeparator = tree.filenameSeparator ?? "-";
  const enabledForkTypes = getEnabledForkTypes(tree);

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
    const sourceNode = nodeId ? findNode(tree.nodes, nodeId) : null;
    const addableTypes = getAddableTypesForNode(
      sourceNode?.nodeType ?? null,
      enabledForkTypes,
    );

    if (!addableTypes.length) {
      setStatus("Output format rows are terminal. Add new forks above this file row.");
      return;
    }

    if (nodeId) {
      setSelectedNodeId(nodeId);
    }
    setOpenMenuNodeId(null);
    setVersionSourceNodeId(nodeId ?? null);
    setVersionsTarget(nodeId ? "selected" : "all");

    const nextType = addableTypes.includes(versionsType)
      ? versionsType
      : addableTypes[0];
    setVersionsType(nextType);
    setSelectedPresetLabels(presetValues[nextType]);
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

    const nextNodes = addVersionNodes(tree.nodes, {
      autoApplyOutputFormats,
      defaultOutputFormats,
      labels: uniqueLabels,
      enabledForkTypes,
      selectedNodeId: versionsTarget === "selected" ? versionSourceNodeId : null,
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

  function updateFilenameDefaults(
    nextCase: FilenameCase,
    nextSeparator: FilenameSeparator,
  ) {
    commitTree({
      ...tree,
      filenameCase: nextCase,
      filenameSeparator: nextSeparator,
    });
  }

  function updateEnabledForkTypes(nextEnabledForkTypes: MatrixNodeType[]) {
    commitTree({
      ...tree,
      enabledForkTypes: nextEnabledForkTypes,
      hierarchy: [
        "creative_unit",
        ...nextEnabledForkTypes,
        "output_format",
      ],
      optionalLevels: nextEnabledForkTypes.filter(
        (type) => !["duration", "aspect_ratio"].includes(type),
      ),
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
        onView={setViewMode}
        search={search}
        view={viewMode}
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
            {viewMode === "rows" ? (
              <>
                <MatrixHeader />
                <div>
                  {filteredRows.map((row) => (
                    <MatrixRow
                      editingLabel={editingLabel}
                      editingNodeId={editingNodeId}
                      filenameCase={filenameCase}
                      filenameSeparator={filenameSeparator}
                      isAncestorContext={
                        hoveredPathIds.includes(row.node.id) &&
                        hoveredNodeId !== row.node.id
                      }
                      isHovered={hoveredNodeId === row.node.id}
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
                      onHoverPath={setHoveredPathIds}
                      onOpenAddVersions={() => openAddVersions(row.node.id)}
                      onSelect={() => toggleNode(row.node)}
                      onStartEdit={() => {
                        setOpenMenuNodeId(null);
                        startInlineEdit(row.node);
                      }}
                      openMenu={openMenuNodeId === row.node.id}
                      projectClientName={project.client_name}
                      projectName={project.name}
                      row={row}
                    />
                  ))}
                </div>
              </>
            ) : viewMode === "pivot" ? (
              <PivotView tree={tree} />
            ) : (
              <TreeOutlineView nodes={tree.nodes} />
            )}
          </div>

          <aside className="grid content-start gap-4">
            <ProjectSettingsPanel
              autoApply={autoApplyOutputFormats}
              enabledForkTypes={enabledForkTypes}
              filenameCase={filenameCase}
              filenameSeparator={filenameSeparator}
              formats={defaultOutputFormats}
              onFilenameChange={updateFilenameDefaults}
              onForkTypesChange={updateEnabledForkTypes}
              onOutputChange={updateOutputDefaults}
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
            A Creative Unit is a top-level piece of creative: a script, spot,
            vignette, product story, market, message, scene, loop, or other
            producer-defined grouping. Give it a working name now; you can
            rename it inline later.
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
          addableTypes={getAddableTypesForNode(
            versionSourceNode?.nodeType ?? null,
            enabledForkTypes,
          )}
          enabledForkTypes={enabledForkTypes}
          selectedNodeLabel={versionSourceNode?.label ?? null}
          selectedNodeType={versionSourceNode?.nodeType ?? null}
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
  onView,
  search,
  view,
}: {
  density: Density;
  disabled: boolean;
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
  filenameCase,
  filenameSeparator,
  isAncestorContext,
  isHovered,
  isOpen,
  isSelected,
  onCommitEdit,
  onDelete,
  onEditLabel,
  onHoverPath,
  onMenu,
  onOpenAddVersions,
  onSelect,
  onStartEdit,
  openMenu,
  projectClientName,
  projectName,
  row,
}: {
  editingLabel: string;
  editingNodeId: string | null;
  filenameCase: FilenameCase;
  filenameSeparator: FilenameSeparator;
  isAncestorContext: boolean;
  isHovered: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onCommitEdit: () => void;
  onDelete: () => void;
  onEditLabel: (label: string) => void;
  onHoverPath: (pathIds: string[]) => void;
  onMenu: () => void;
  onOpenAddVersions: () => void;
  onSelect: () => void;
  onStartEdit: () => void;
  openMenu: boolean;
  projectClientName: string | null;
  projectName: string;
  row: VisibleRow;
}) {
  const { node } = row;
  const terminalCount = countTerminalsForNode(node);
  const kind = rowKind(node.nodeType);
  const hasChildren = Boolean(node.children?.length);

  const isEditing = editingNodeId === node.id;
  const filenameSuggestion =
    node.nodeType === "output_format"
      ? suggestFilename({
          caseStyle: filenameCase,
          clientName: projectClientName,
          pathLabels: row.pathLabels,
          projectName,
          separator: filenameSeparator,
        })
      : null;
  const rowBackground = isSelected
    ? "var(--accent-tint)"
    : isHovered
      ? "var(--bg-subtle)"
      : isAncestorContext
        ? "rgba(214, 235, 126, 0.16)"
        : node.nodeType === "creative_unit"
          ? "var(--bg-panel)"
          : undefined;
  const rowInset = isSelected
    ? "inset 3px 0 0 var(--accent)"
    : isHovered
      ? "inset 3px 0 0 var(--ink-3)"
      : isAncestorContext
        ? "inset 2px 0 0 rgba(154, 178, 55, 0.35)"
        : undefined;

  return (
    <div
      className="group relative grid w-full grid-cols-[minmax(0,1fr)_110px_90px_72px_72px_28px] items-center border-b border-[var(--line-faint)] bg-transparent py-0 pr-[var(--row-px)] pl-2 text-left text-[var(--ink-1)] transition hover:bg-[var(--bg-subtle)]"
      onClick={onSelect}
      onMouseEnter={() => onHoverPath(row.pathIds)}
      onMouseLeave={() => onHoverPath([])}
      style={{
        minHeight: "var(--row-h)",
        background: rowBackground,
        boxShadow: rowInset,
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
        <NodeGlyph label={node.label} nodeType={node.nodeType} />
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
          <>
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
            {filenameSuggestion ? (
              <span
                className={`mono ml-2 min-w-0 truncate rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-0.5 text-[length:var(--row-meta-fs)] text-[var(--ink-3)] ${
                  isHovered || isSelected ? "inline-block" : "hidden group-hover:inline-block"
                }`}
              >
                {filenameSuggestion}
              </span>
            ) : null}
            {node.nodeType !== "output_format" ? (
              <button
                className="ml-2 hidden shrink-0 rounded-full border border-[var(--line)] bg-[var(--bg-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-ink)] shadow-[var(--shadow-card)] hover:border-[var(--accent-soft)] group-hover:inline-flex"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenAddVersions();
                }}
                type="button"
              >
                + Add versions
              </button>
            ) : null}
          </>
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

function NodeGlyph({
  label,
  nodeType,
}: {
  label: string;
  nodeType: MatrixNodeType;
}) {
  if (nodeType === "aspect_ratio") {
    const ratio = parseAspectRatio(label);
    return (
      <span className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center text-[var(--ink-3)]">
        <span
          className="block rounded-[2px] border border-current"
          style={{
            height: ratio.height,
            width: ratio.width,
          }}
        />
      </span>
    );
  }

  const iconClass = "h-3.5 w-3.5";
  const icon = {
    creative_unit: <Sparkles className={iconClass} />,
    duration: <Clock3 className={iconClass} />,
    platform: <Monitor className={iconClass} />,
    localization: <Languages className={iconClass} />,
    technical_variant: <SlidersHorizontal className={iconClass} />,
    output_format: <FileText className={iconClass} />,
  }[nodeType];

  return (
    <span className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] text-[var(--ink-3)]">
      {icon}
    </span>
  );
}

function TypeTag({
  kind,
}: {
  kind:
    | "unit"
    | "cut"
    | "ratio"
    | "file"
    | "platform"
    | "locale"
    | "variant";
}) {
  const label = {
    unit: "UNIT",
    cut: "CUT",
    ratio: "RATIO",
    file: "FILE",
    platform: "PLAT",
    locale: "LOC",
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

function ProjectSettingsPanel({
  autoApply,
  enabledForkTypes,
  filenameCase,
  filenameSeparator,
  formats,
  onFilenameChange,
  onForkTypesChange,
  onOutputChange,
}: {
  autoApply: boolean;
  enabledForkTypes: MatrixNodeType[];
  filenameCase: FilenameCase;
  filenameSeparator: FilenameSeparator;
  formats: string[];
  onFilenameChange: (
    caseStyle: FilenameCase,
    separator: FilenameSeparator,
  ) => void;
  onForkTypesChange: (forkTypes: MatrixNodeType[]) => void;
  onOutputChange: (formats: string[], autoApply: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"outputs" | "taxonomy">("outputs");
  const baseFormats = ["H264 MP4", "ProRes MOV", "WebM"];
  const [customFormat, setCustomFormat] = useState("");
  const options = Array.from(new Set([...baseFormats, ...formats]));

  function toggleFormat(format: string) {
    const nextFormats = formats.includes(format)
      ? formats.filter((item) => item !== format)
      : [...formats, format];
    onOutputChange(nextFormats.length ? nextFormats : ["H264 MP4"], autoApply);
  }

  function addCustomFormat() {
    const nextFormat = customFormat.trim();
    if (!nextFormat) {
      return;
    }
    onOutputChange(Array.from(new Set([...formats, nextFormat])), autoApply);
    setCustomFormat("");
  }

  function toggleForkType(forkType: MatrixNodeType) {
    const nextForkTypes = enabledForkTypes.includes(forkType)
      ? enabledForkTypes.filter((item) => item !== forkType)
      : [...enabledForkTypes, forkType];
    onForkTypesChange(sortForkTypes(nextForkTypes));
  }

  return (
    <section className="dt-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Project setup</h2>
        <span className="dt-eyebrow">Project</span>
      </div>
      <div className="dt-segment mt-4 w-full">
        <button
          className={activeTab === "outputs" ? "is-active" : ""}
          onClick={() => setActiveTab("outputs")}
          type="button"
        >
          Output defaults
        </button>
        <button
          className={activeTab === "taxonomy" ? "is-active" : ""}
          onClick={() => setActiveTab("taxonomy")}
          type="button"
        >
          Project taxonomy
        </button>
      </div>

      {activeTab === "outputs" ? (
        <>
          <p className="dt-sub mt-4">
            These formats populate new terminal branches when auto-populate is on.
          </p>
          <div className="mt-4 grid gap-2">
            {options.map((format) => (
              <label
                className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1.5 text-sm text-[var(--ink-2)]"
                key={format}
              >
                <input
                  checked={formats.includes(format)}
                  onChange={() => toggleFormat(format)}
                  type="checkbox"
                />
                <span className="mono">{format}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="dt-input min-w-0 flex-1"
              onChange={(event) => setCustomFormat(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addCustomFormat();
                }
              }}
              placeholder="Custom format"
              value={customFormat}
            />
            <button className="dt-btn" onClick={addCustomFormat} type="button">
              Add
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-[var(--ink-2)]">
            <input
              checked={autoApply}
              className="mt-1"
              onChange={(event) =>
                onOutputChange(formats, event.target.checked)
              }
              type="checkbox"
            />
            Auto-populate new taxonomy branches with these output formats.
          </label>

          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Filename style</h3>
                <p className="dt-sub mt-1">
                  Suggested names start with client and project, then follow the
                  row path.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              <label className="dt-field">
                Separator
                <select
                  className="dt-input"
                  onChange={(event) =>
                    onFilenameChange(
                      filenameCase,
                      event.target.value as FilenameSeparator,
                    )
                  }
                  value={filenameSeparator}
                >
                  <option value="-">Hyphen: client-project-name</option>
                  <option value="_">Underscore: client_project_name</option>
                </select>
              </label>
              <label className="dt-field">
                Case
                <select
                  className="dt-input"
                  onChange={(event) =>
                    onFilenameChange(
                      event.target.value as FilenameCase,
                      filenameSeparator,
                    )
                  }
                  value={filenameCase}
                >
                  <option value="lower">lowercase</option>
                  <option value="title">Title Case</option>
                  <option value="camel">CamelCase</option>
                </select>
              </label>
              <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-subtle)] px-3 py-2">
                <div className="dt-eyebrow">Preview</div>
                <div className="mono mt-1 truncate text-xs text-[var(--ink-2)]">
                  {formatFilenameParts(
                    ["Client", "Project Name", "Creative Unit 01", ":30", "16x9"],
                    {
                      caseStyle: filenameCase,
                      separator: filenameSeparator,
                    },
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="dt-sub">
            Creative Unit and Output Format are always present. Enable only the
            fork levels this project needs.
          </p>
          <div className="grid gap-2">
            {taxonomyOptions.map((option) => (
              <label
                className="flex items-start gap-3 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-3 py-2.5 text-sm text-[var(--ink-2)]"
                key={option.type}
              >
                <input
                  checked={enabledForkTypes.includes(option.type)}
                  className="mt-1"
                  onChange={() => toggleForkType(option.type)}
                  type="checkbox"
                />
                <span className="mt-0.5 text-[var(--ink-3)]">
                  <NodeGlyph label={option.example} nodeType={option.type} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--ink-1)]">
                    {nodeTypeLabels[option.type]}
                  </span>
                  <span className="dt-sub mt-0.5 block">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-subtle)] p-3">
            <div className="dt-eyebrow">Active path</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-2)]">
              {getTaxonomyFlow(enabledForkTypes).map((type, index, path) => (
                <span className="inline-flex items-center gap-1.5" key={type}>
                  <span className="dt-chip">{nodeTypeLabels[type]}</span>
                  {index < path.length - 1 ? (
                    <ChevronRight className="h-3 w-3 text-[var(--ink-4)]" />
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </div>
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

function PivotView({ tree }: { tree: DeliverableTree }) {
  const durations = Array.from(
    new Set(
      flattenAllNodes(tree.nodes)
        .filter((node) => node.nodeType === "duration")
        .map((node) => node.label),
    ),
  );

  return (
    <div className="overflow-auto p-4">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="mono text-left text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            <th className="border-b border-[var(--line)] px-3 py-2">Creative Unit</th>
            {durations.map((duration) => (
              <th className="border-b border-[var(--line)] px-3 py-2 text-center" key={duration}>
                {duration}
              </th>
            ))}
            <th className="border-b border-[var(--line)] px-3 py-2 text-right">
              Files
            </th>
          </tr>
        </thead>
        <tbody>
          {tree.nodes.map((unit) => (
            <tr key={unit.id} className="border-b border-[var(--line-faint)]">
              <td className="px-3 py-3 font-semibold">{unit.label}</td>
              {durations.map((duration) => {
                const cut = unit.children?.find(
                  (child) =>
                    child.nodeType === "duration" && child.label === duration,
                );
                return (
                  <td className="px-3 py-3 text-center" key={duration}>
                    {cut ? (
                      <span className="dt-chip">
                        {countNodesInSubtree(cut, "aspect_ratio")} ratios ·{" "}
                        {countTerminalsForNode(cut)} files
                      </span>
                    ) : (
                      <span className="text-[var(--ink-4)]">—</span>
                    )}
                  </td>
                );
              })}
              <td className="mono px-3 py-3 text-right font-semibold">
                {countTerminalsForNode(unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TreeOutlineView({ nodes }: { nodes: DeliverableNode[] }) {
  return (
    <div className="grid gap-3 p-4">
      {nodes.map((node) => (
        <TreeOutlineNode key={node.id} node={node} />
      ))}
    </div>
  );
}

function TreeOutlineNode({ node }: { node: DeliverableNode }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-app)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="dt-eyebrow">{nodeTypeLabels[node.nodeType]}</span>
          <p className="mt-1 font-semibold">{node.label}</p>
        </div>
        <span className="dt-chip">{countTerminalsForNode(node)} files</span>
      </div>
      {node.children?.length ? (
        <div className="mt-3 grid gap-2 border-l border-dashed border-[var(--line-strong)] pl-3">
          {node.children.map((child) => (
            <TreeOutlineNode key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </div>
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
  addableTypes,
  customLabels,
  enabledForkTypes,
  onClose,
  onCustomLabels,
  onPresetLabels,
  onSubmit,
  onTarget,
  onType,
  presetLabels,
  selectedNodeLabel,
  selectedNodeType,
  target,
  type,
}: {
  addableTypes: MatrixNodeType[];
  customLabels: string;
  enabledForkTypes: MatrixNodeType[];
  onClose: () => void;
  onCustomLabels: (labels: string) => void;
  onPresetLabels: (labels: string[]) => void;
  onSubmit: () => void;
  onTarget: (target: AddVersionsTarget) => void;
  onType: (type: MatrixNodeType) => void;
  presetLabels: string[];
  selectedNodeLabel: string | null;
  selectedNodeType: MatrixNodeType | null;
  target: AddVersionsTarget;
  type: MatrixNodeType;
}) {
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
                disabled={!selectedNodeLabel}
                onChange={() => onTarget("selected")}
                type="radio"
              />
              Selected branch
              {selectedNodeLabel && selectedNodeType ? (
                <>
                  <span className="dt-chip">{selectedNodeLabel}</span>
                  <span className="text-[var(--ink-4)]">
                    {scopeDescription(selectedNodeType, type, enabledForkTypes)}
                  </span>
                </>
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
              All matching branches in project
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
    pathIds: string[],
  ) {
    const last = index === siblings.length - 1;
    const nextPath = [...path, node.label];
    const nextPathIds = [...pathIds, node.id];
    rows.push({
      node,
      depth,
      last,
      ancestorsLast,
      pathIds: nextPathIds,
      pathLabels: nextPath,
      pathText: nextPath.join(" / "),
    });

    if (openIds.has(node.id)) {
      node.children?.forEach((child, childIndex, childSiblings) =>
        walk(
          child,
          depth + 1,
          childIndex,
          childSiblings,
          [...ancestorsLast, last],
          nextPath,
          nextPathIds,
        ),
      );
    }
  }

  nodes.forEach((node, index, siblings) =>
    walk(node, 0, index, siblings, [], [], []),
  );

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

function flattenAllNodes(nodes: DeliverableNode[]) {
  const allNodes: DeliverableNode[] = [];

  function walk(node: DeliverableNode) {
    allNodes.push(node);
    node.children?.forEach(walk);
  }

  nodes.forEach(walk);

  return allNodes;
}

function countNodesInSubtree(node: DeliverableNode, nodeType: MatrixNodeType) {
  let count = 0;

  function walk(current: DeliverableNode) {
    if (current.nodeType === nodeType) {
      count += 1;
    }
    current.children?.forEach(walk);
  }

  walk(node);

  return count;
}

function suggestFilename({
  caseStyle,
  clientName,
  pathLabels,
  projectName,
  separator,
}: {
  caseStyle: FilenameCase;
  clientName: string | null;
  pathLabels: string[];
  projectName: string;
  separator: FilenameSeparator;
}) {
  return formatFilenameParts(
    [clientName, projectName, ...pathLabels].filter(Boolean) as string[],
    { caseStyle, separator },
  );
}

function formatFilenameParts(
  parts: string[],
  options: {
    caseStyle: FilenameCase;
    separator: FilenameSeparator;
  },
) {
  const words = parts.flatMap(splitFilenameWords);

  if (options.caseStyle === "camel") {
    return words.map(toPascalWord).join("");
  }

  const formattedWords =
    options.caseStyle === "title"
      ? words.map(toPascalWord)
      : words.map((word) => word.toLowerCase());

  return formattedWords.join(options.separator);
}

function splitFilenameWords(value: string) {
  return value
    .trim()
    .replace(/^:/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

function toPascalWord(value: string) {
  const lower = value.toLowerCase();

  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

function getEnabledForkTypes(tree: DeliverableTree) {
  return sortForkTypes(
    tree.enabledForkTypes?.length
      ? tree.enabledForkTypes
      : defaultEnabledForkTypes,
  );
}

function sortForkTypes(types: MatrixNodeType[]) {
  const uniqueTypes = new Set(types.filter((type) => forkTypeOrder.includes(type)));

  return forkTypeOrder.filter((type) => uniqueTypes.has(type));
}

function getTaxonomyFlow(enabledForkTypes: MatrixNodeType[]) {
  return [
    "creative_unit",
    ...sortForkTypes(enabledForkTypes),
    "output_format",
  ] satisfies MatrixNodeType[];
}

function parseAspectRatio(label: string) {
  const match = label.match(/(\d+(?:\.\d+)?)\s*[x:]\s*(\d+(?:\.\d+)?)/i);

  if (!match) {
    return { height: 14, width: 18 };
  }

  const widthValue = Number(match[1]);
  const heightValue = Number(match[2]);
  const ratio = widthValue / heightValue;

  if (ratio > 1.4) {
    return { height: 11, width: 20 };
  }

  if (ratio < 0.8) {
    return { height: 20, width: 11 };
  }

  return { height: 16, width: 16 };
}

function getAddableTypesForNode(
  nodeType: MatrixNodeType | null,
  enabledForkTypes: MatrixNodeType[],
): MatrixNodeType[] {
  const flow = getTaxonomyFlow(enabledForkTypes);

  if (!nodeType) {
    return flow.filter((type) => type !== "creative_unit");
  }

  const index = flow.indexOf(nodeType);

  if (index < 0) {
    return [];
  }

  return flow.slice(index + 1);
}

function scopeDescription(
  selectedNodeType: MatrixNodeType,
  versionType: MatrixNodeType,
  enabledForkTypes: MatrixNodeType[],
) {
  if (canAddVersionToParent(selectedNodeType, versionType, enabledForkTypes)) {
    return `adds under this ${nodeTypeLabels[selectedNodeType]}`;
  }

  return `adds to matching branches inside this ${nodeTypeLabels[selectedNodeType]}`;
}

function addVersionNodes(
  nodes: DeliverableNode[],
  options: {
    autoApplyOutputFormats: boolean;
    defaultOutputFormats: string[];
    enabledForkTypes: MatrixNodeType[];
    labels: string[];
    selectedNodeId: string | null;
    target: AddVersionsTarget;
    type: MatrixNodeType;
  },
): DeliverableNode[] {
  function walk(node: DeliverableNode, insideSelectedBranch: boolean): DeliverableNode {
    const nextInsideSelectedBranch =
      insideSelectedBranch || node.id === options.selectedNodeId;
    const inScope =
      options.target === "all" ||
      (options.selectedNodeId ? nextInsideSelectedBranch : false);
    const shouldAddHere =
      inScope &&
      canAddVersionToParent(
        node.nodeType,
        options.type,
        options.enabledForkTypes,
      );
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
        ...existingChildren.map((child) => walk(child, nextInsideSelectedBranch)),
        ...addedChildren,
      ],
    };
  }

  return nodes.map((node) => walk(node, false));
}

function createVersionNode(
  type: MatrixNodeType,
  label: string,
  defaultOutputFormats: string[],
  autoApplyOutputFormats: boolean,
) {
  const shouldAttachOutputs =
    autoApplyOutputFormats &&
    ["aspect_ratio", "platform", "localization", "technical_variant"].includes(
      type,
    );
  const children = shouldAttachOutputs
    ? defaultOutputFormats.map((format) => createNode("output_format", format))
    : [];

  return createNode(type, label, children);
}

function canAddVersionToParent(
  parentType: MatrixNodeType,
  childType: MatrixNodeType,
  enabledForkTypes: MatrixNodeType[],
) {
  if (childType === "output_format") {
    if (parentType === "creative_unit") {
      return enabledForkTypes.length === 0;
    }

    if (parentType === "duration") {
      return !enabledForkTypes.includes("aspect_ratio");
    }

    return [
      "aspect_ratio",
      "platform",
      "localization",
      "technical_variant",
    ].includes(parentType);
  }

  const flow = getTaxonomyFlow(enabledForkTypes);
  const parentIndex = flow.indexOf(parentType);

  return parentIndex >= 0 && flow[parentIndex + 1] === childType;
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
    localization: "locale",
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
    localization: "localization",
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
