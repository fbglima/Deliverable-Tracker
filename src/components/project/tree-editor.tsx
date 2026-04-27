"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitCompareArrows,
  Languages,
  LayoutGrid,
  ListTree,
  MoreHorizontal,
  Pencil,
  Monitor,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import {
  saveSnapshot,
  updateProjectDetails,
  updateProjectTree,
} from "@/app/actions";
import type {
  AiConfidence,
  AiIntakeResult,
  AiSuggestion,
} from "@/lib/ai/intake";
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
type ExportFormat = "csv";
type SheetsExportMode = "creative" | "terminal";
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

type SnapshotDiffEntry = {
  id: string;
  label: string;
  nodeType: MatrixNodeType;
  pathText: string;
};

type SnapshotChangeEntry = {
  after: SnapshotDiffEntry;
  before: SnapshotDiffEntry;
};

type SnapshotDiff = {
  added: SnapshotDiffEntry[];
  afterCounts: ReturnType<typeof calculateCounts>;
  afterTypeCounts: Record<MatrixNodeType, number>;
  beforeCounts: ReturnType<typeof calculateCounts>;
  beforeTypeCounts: Record<MatrixNodeType, number>;
  changed: SnapshotChangeEntry[];
  removed: SnapshotDiffEntry[];
};

type ExportPath = {
  filename: string;
  nodes: DeliverableNode[];
  pathText: string;
};

type AiApplyDraft = {
  labelsText: string;
  nodeType: MatrixNodeType;
  target: "all_creative_units" | "suggested_path";
};

type AiApplyPlan = {
  blockedReason: string | null;
  changeCount: number;
  labels: string[];
  previewTargets: string[];
  targetCount: number;
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

const allNodeTypes: MatrixNodeType[] = [
  "creative_unit",
  ...forkTypeOrder,
  "output_format",
];

const technicalStandardLabel = "[standard]";

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
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [projectClientName, setProjectClientName] = useState(
    project.client_name ?? "",
  );
  const [projectCampaignName, setProjectCampaignName] = useState(
    project.campaign_name ?? "",
  );
  const [projectDescription, setProjectDescription] = useState(
    project.description ?? "",
  );
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
  const [compareSnapshotId, setCompareSnapshotId] = useState<string>(
    initialSnapshots[0]?.id ?? "",
  );
  const [aiInputText, setAiInputText] = useState("");
  const [aiResult, setAiResult] = useState<AiIntakeResult | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showAiIntroModal, setShowAiIntroModal] = useState(false);
  const [acceptedAiSuggestionIds, setAcceptedAiSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [rejectedAiSuggestionIds, setRejectedAiSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isAnalyzingIntake, setIsAnalyzingIntake] = useState(false);
  const [enumerateTextExports, setEnumerateTextExports] = useState(false);
  const [includeTechnicalExports, setIncludeTechnicalExports] = useState(false);
  const [status, setStatus] = useState("Unsaved edits local until saved.");
  const [isPending, startTransition] = useTransition();

  const versionSourceNode = versionSourceNodeId
    ? findNode(tree.nodes, versionSourceNodeId)
    : null;
  const counts = calculateCounts(tree);
  const cuts = countNodesByType(tree, "duration");
  const ratios = countNodesByType(tree, "aspect_ratio");
  const rows = useMemo(() => flattenRows(tree.nodes, openIds), [tree, openIds]);
  const hoveredNodeId = hoveredPathIds[hoveredPathIds.length - 1] ?? null;
  const compareSnapshot =
    initialSnapshots.find((snapshot) => snapshot.id === compareSnapshotId) ??
    initialSnapshots[0] ??
    null;
  const snapshotDiff = useMemo(
    () =>
      compareSnapshot ? compareTrees(compareSnapshot.tree_json, tree) : null,
    [compareSnapshot, tree],
  );
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => row.pathText.toLowerCase().includes(query));
  }, [rows, search]);
  const projectTitle = [projectClientName, projectCampaignName || projectName]
    .filter(Boolean)
    .join(" · ");
  const defaultOutputFormats =
    tree.defaultOutputFormats?.length
      ? tree.defaultOutputFormats.map(normalizeOutputFormatLabel)
      : ["h.264 .mp4", "ProRes .mov"];
  const autoApplyOutputFormats = tree.autoApplyOutputFormats ?? true;
  const creativeUnitLabel = tree.creativeUnitLabel?.trim() || "Creative Unit";
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
    const label = creativeUnitName.trim() || `${creativeUnitLabel} 01`;
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

  function duplicateNode(nodeId: string) {
    const result = duplicateNodeInTree(tree.nodes, nodeId);

    if (!result) {
      setStatus("Could not duplicate this row.");
      return;
    }

    commitTree({ ...tree, nodes: result.nodes });
    setSelectedNodeId(result.duplicatedNode.id);
    setOpenMenuNodeId(null);
    setOpenIds((current) => {
      const next = new Set(current);
      collectOpenIds(result.duplicatedNode, next);
      return next;
    });
    setStatus("Row duplicated locally. Save when ready.");
  }

  function openAddVersions(nodeId?: string) {
    const resolvedNodeId = nodeId === undefined ? selectedNodeId : nodeId;
    const sourceNode = resolvedNodeId ? findNode(tree.nodes, resolvedNodeId) : null;
    const addableTypes = getAddableTypesForNode(
      sourceNode?.nodeType ?? null,
      enabledForkTypes,
    );

    if (!addableTypes.length) {
      setStatus("Output format rows are files. Add new forks above this row.");
      return;
    }

    if (resolvedNodeId) {
      setSelectedNodeId(resolvedNodeId);
    }
    setOpenMenuNodeId(null);
    setVersionSourceNodeId(resolvedNodeId ?? null);
    setVersionsTarget(resolvedNodeId ? "selected" : "all");

    const nextType = addableTypes.includes(versionsType)
      ? versionsType
      : addableTypes[0];
    setVersionsType(nextType);
    setSelectedPresetLabels(defaultPresetLabelsForType(nextType));
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
    const uniqueLabels = Array.from(
      new Set(
        versionsType === "technical_variant"
          ? [technicalStandardLabel, ...labels]
          : labels,
      ),
    );

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

  function updateCreativeUnitLabel(label: string) {
    commitTree({
      ...tree,
      creativeUnitLabel: label.trim() || "Creative Unit",
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

  function saveProjectDetails() {
    startTransition(async () => {
      try {
        await updateProjectDetails(project.id, {
          campaignName: projectCampaignName,
          clientName: projectClientName,
          description: projectDescription,
          name: projectName,
        });
        setShowProjectModal(false);
        setStatus("Project details saved");
        router.refresh();
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Could not save project",
        );
      }
    });
  }

  function createSnapshot(closeAfterSave = false) {
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
        if (closeAfterSave) {
          setShowSnapshotModal(false);
        }
        router.refresh();
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Could not save snapshot",
        );
      }
    });
  }

  async function analyzeIntake() {
    const inputText = aiInputText.trim();

    if (!inputText) {
      setAiStatus("Paste client notes or a brief before analyzing.");
      return;
    }

    setIsAnalyzingIntake(true);
    setAiStatus("Analyzing pasted notes...");
    setAiResult(null);
    setAcceptedAiSuggestionIds(new Set());
    setRejectedAiSuggestionIds(new Set());

    try {
      const response = await fetch("/api/ai/intake", {
        body: JSON.stringify({
          inputText,
          project: {
            client_name: projectClientName || null,
            id: project.id,
            name: projectName,
          },
          tree,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const result = (await response.json()) as AiIntakeResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not analyze with AI Assistant.");
      }

      setAiResult(result);
      setAiStatus("Review suggestions before applying them.");
    } catch (error) {
      setAiStatus(
        error instanceof Error ? error.message : "Could not analyze with AI Assistant.",
      );
    } finally {
      setIsAnalyzingIntake(false);
    }
  }

  function acceptAiSuggestion(suggestion: AiSuggestion, draft: AiApplyDraft) {
    const result = applyAiSuggestionDraft(tree.nodes, suggestion, draft, {
      autoApplyOutputFormats,
      defaultOutputFormats,
      enabledForkTypes,
    });

    if (!result.applied) {
      setStatus(result.message);
      return;
    }

    commitTree({ ...tree, nodes: result.nodes });
    setOpenIds((current) => {
      const next = new Set(current);

      result.openNodeTypes.forEach((nodeType) =>
        collectOpenIdsForType(result.nodes, nodeType, next),
      );
      result.openPaths.forEach((path) => collectOpenIdsForPath(result.nodes, path, next));

      return next;
    });
    setAcceptedAiSuggestionIds((current) => new Set(current).add(suggestion.id));
    setRejectedAiSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestion.id);
      return next;
    });
    setStatus(result.message);
  }

  function rejectAiSuggestion(suggestionId: string) {
    setRejectedAiSuggestionIds((current) => new Set(current).add(suggestionId));
    setAcceptedAiSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
  }

  function openAiAssistant() {
    if (!aiAssistantEnabled) {
      setShowAiIntroModal(true);
      return;
    }

    setShowAiAssistant((current) => !current);
  }

  function enableAiAssistant() {
    setAiAssistantEnabled(true);
    setShowAiAssistant(true);
    setShowAiIntroModal(false);
  }

  return (
    <div className="dt-frame" style={densityVars[density]}>
      <TopBar
        projectName={projectName}
        snapshotCount={initialSnapshots.length}
        status={status}
        workspaceName={workspaceName}
      />
      <ProjectHeader
        creativeUnitLabel={creativeUnitLabel}
        creativeUnits={countNodesByType(tree, "creative_unit")}
        cuts={cuts}
        description={
          projectDescription ||
          "Build, revise, and snapshot the current working deliverables matrix."
        }
        onEdit={() => setShowProjectModal(true)}
        ratios={ratios}
        deliverableFiles={counts.terminalFiles}
        title={projectTitle}
      />
      <Toolbar
        density={density}
        disabled={isPending}
        onDensity={setDensity}
        onSave={saveTree}
        onSearch={setSearch}
        onToggleAiAssistant={openAiAssistant}
        onSnapshot={() => setShowSnapshotModal(true)}
        onView={setViewMode}
        search={search}
        view={viewMode}
      />

      <main className="dt-canvas">
        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 content-start gap-4">
            <div className="dt-panel min-w-0 overflow-visible">
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
                    <Plus className="h-3.5 w-3.5" /> Add {creativeUnitLabel}
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
                        onDuplicate={() => duplicateNode(row.node.id)}
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
                        projectClientName={projectClientName || null}
                        projectName={projectCampaignName || projectName}
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

            {showAiAssistant ? (
              <AiAssistantPanel
                acceptedSuggestionIds={acceptedAiSuggestionIds}
                enabledForkTypes={enabledForkTypes}
                inputText={aiInputText}
                isAnalyzing={isAnalyzingIntake}
                onAccept={acceptAiSuggestion}
                onAnalyze={analyzeIntake}
                onInputText={setAiInputText}
                onReject={rejectAiSuggestion}
                onSnapshot={() => setShowSnapshotModal(true)}
                rejectedSuggestionIds={rejectedAiSuggestionIds}
                result={aiResult}
                status={aiStatus}
                tree={tree}
              />
            ) : null}
          </div>

          <aside className="grid min-w-0 content-start gap-4">
            <ProjectSettingsPanel
              autoApply={autoApplyOutputFormats}
              enabledForkTypes={enabledForkTypes}
              filenameCase={filenameCase}
              filenameSeparator={filenameSeparator}
              formats={defaultOutputFormats}
              creativeUnitLabel={creativeUnitLabel}
              onCreativeUnitLabelChange={updateCreativeUnitLabel}
              onFilenameChange={updateFilenameDefaults}
              onForkTypesChange={updateEnabledForkTypes}
              onOutputChange={updateOutputDefaults}
            />
            <ExportPanel
              enumerateDeliverables={enumerateTextExports}
              filenameCase={filenameCase}
              filenameSeparator={filenameSeparator}
              includeTechnical={includeTechnicalExports}
              onEnumerateDeliverables={setEnumerateTextExports}
              onIncludeTechnical={setIncludeTechnicalExports}
              project={{
                ...project,
                campaign_name: projectCampaignName || null,
                client_name: projectClientName || null,
                description: projectDescription || null,
                name: projectName,
              }}
              tree={tree}
            />
            <SnapshotPanel
              isPending={isPending}
              onNotes={setSnapshotNotes}
              onSaveSnapshot={() => createSnapshot(false)}
              onSnapshotName={setSnapshotName}
              snapshotName={snapshotName}
              snapshotNotes={snapshotNotes}
              snapshots={initialSnapshots}
              status={status}
            />
            <SnapshotComparePanel
              diff={snapshotDiff}
              onSnapshot={setCompareSnapshotId}
              selectedSnapshotId={compareSnapshot?.id ?? ""}
              snapshot={compareSnapshot}
              snapshots={initialSnapshots}
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
            A {creativeUnitLabel} is a top-level piece of creative: a script, spot,
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
              placeholder={`${creativeUnitLabel} 01`}
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

      {showProjectModal ? (
        <ProjectDetailsModal
          campaignName={projectCampaignName}
          clientName={projectClientName}
          description={projectDescription}
          isPending={isPending}
          name={projectName}
          onCampaignName={setProjectCampaignName}
          onClientName={setProjectClientName}
          onClose={() => setShowProjectModal(false)}
          onDescription={setProjectDescription}
          onName={setProjectName}
          onSave={saveProjectDetails}
        />
      ) : null}

      {showSnapshotModal ? (
        <SnapshotModal
          isPending={isPending}
          notes={snapshotNotes}
          onClose={() => setShowSnapshotModal(false)}
          onNotes={setSnapshotNotes}
          onSave={() => createSnapshot(true)}
          onSnapshotName={setSnapshotName}
          snapshotName={snapshotName}
        />
      ) : null}

      {showVersionsModal ? (
        <AddVersionsModal
          creativeUnitLabel={creativeUnitLabel}
          customLabels={customVersionLabels}
          onClose={() => setShowVersionsModal(false)}
          onCustomLabels={setCustomVersionLabels}
          onPresetLabels={setSelectedPresetLabels}
          onSubmit={addVersions}
          onTarget={setVersionsTarget}
          onType={(type) => {
            setVersionsType(type);
            setSelectedPresetLabels(defaultPresetLabelsForType(type));
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

      {showAiIntroModal ? (
        <Modal
          maxWidthClassName="max-w-xl"
          onClose={() => setShowAiIntroModal(false)}
          title="Add AI Assistant?"
        >
          <div className="grid gap-4">
            <div className="dt-ai-sheen h-1.5 rounded-full" />
            <p className="text-sm leading-6 text-[var(--ink-2)]">
              AI Assistant can help interpret project briefs, client messages,
              and scope notes, then suggest delivery matrix changes and client
              questions for your review.
            </p>
            <p className="border-l-2 border-[var(--line-strong)] pl-3 text-[11px] leading-5 text-[var(--ink-3)]">
              Pasted copy is not stored by this app, but it is processed by
              OpenAI servers. Use discretion with highly confidential material.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="dt-btn"
                onClick={() => setShowAiIntroModal(false)}
                type="button"
              >
                Not now
              </button>
              <button
                className="dt-ai-cta"
                onClick={enableAiAssistant}
                type="button"
              >
                Add AI Assistant
              </button>
            </div>
          </div>
        </Modal>
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
  creativeUnitLabel,
  creativeUnits,
  cuts,
  deliverableFiles,
  description,
  onEdit,
  ratios,
  title,
}: {
  creativeUnitLabel: string;
  creativeUnits: number;
  cuts: number;
  deliverableFiles: number;
  description: string;
  onEdit: () => void;
  ratios: number;
  title: string;
}) {
  return (
    <header className="dt-projhead group">
      <div>
        <div className="dt-eyebrow">Project · Campaign</div>
        <div className="flex items-center gap-2">
          <h1>{title}</h1>
          <button
            className="dt-btn h-7 px-2 opacity-0 transition group-hover:opacity-100"
            onClick={onEdit}
            title="Edit project details"
            type="button"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="dt-sub max-w-[520px]">{description}</div>
      </div>
      <div className="dt-statgrid">
        <Stat label={pluralizeLabel(creativeUnitLabel)} value={creativeUnits} />
        <Stat label="Cuts" value={cuts} />
        <Stat label="Ratios" value={ratios} />
        <Stat label="Deliverable files" value={deliverableFiles} />
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
  onToggleAiAssistant,
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
  onToggleAiAssistant: () => void;
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
      <button
        className="dt-ai-btn"
        disabled={disabled}
        onClick={onToggleAiAssistant}
        type="button"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI Assistant
        <span className="mono text-[10px] opacity-75">⌥A</span>
      </button>
      <button className="dt-btn" disabled={disabled} onClick={onSnapshot} type="button">
        <Camera className="h-3.5 w-3.5" /> Snapshot
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
  onDuplicate,
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
  onDuplicate: () => void;
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
  const rowBorderColor =
    node.nodeType === "output_format" ? "var(--line-faint)" : "var(--line-strong)";

  return (
    <div
      className={`dt-matrix-row group relative grid w-full grid-cols-[minmax(0,1fr)_110px_90px_72px_72px_28px] items-center border-b bg-transparent py-0 pr-[var(--row-px)] pl-2 text-left text-[var(--ink-1)] transition-[background-color,border-color,box-shadow] duration-150 hover:bg-[var(--bg-subtle)] ${
        openMenu ? "z-40" : "z-0"
      }`}
      onClick={onSelect}
      onMouseEnter={() => onHoverPath(row.pathIds)}
      onMouseLeave={() => onHoverPath([])}
      style={{
        minHeight: "var(--row-h)",
        background: rowBackground,
        borderBottomColor: rowBorderColor,
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
              <>
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
                <button
                  className="ml-1 hidden shrink-0 rounded-full border border-[var(--line)] bg-[var(--bg-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-2)] shadow-[var(--shadow-card)] hover:border-[var(--line-strong)] hover:text-[var(--ink-1)] group-hover:inline-flex"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicate();
                  }}
                  type="button"
                >
                  <Copy className="h-3 w-3" /> Duplicate
                </button>
              </>
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
          className="absolute right-5 top-[calc(100%-4px)] z-50 w-44 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-elevated)] py-1 text-sm shadow-[var(--shadow-pop)]"
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
          {node.nodeType !== "output_format" ? (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-subtle)]"
              onClick={onDuplicate}
              type="button"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
          ) : null}
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
  creativeUnitLabel,
  enabledForkTypes,
  filenameCase,
  filenameSeparator,
  formats,
  onCreativeUnitLabelChange,
  onFilenameChange,
  onForkTypesChange,
  onOutputChange,
}: {
  autoApply: boolean;
  creativeUnitLabel: string;
  enabledForkTypes: MatrixNodeType[];
  filenameCase: FilenameCase;
  filenameSeparator: FilenameSeparator;
  formats: string[];
  onCreativeUnitLabelChange: (label: string) => void;
  onFilenameChange: (
    caseStyle: FilenameCase,
    separator: FilenameSeparator,
  ) => void;
  onForkTypesChange: (forkTypes: MatrixNodeType[]) => void;
  onOutputChange: (formats: string[], autoApply: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"outputs" | "taxonomy">("outputs");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const baseFormats = ["h.264 .mp4", "ProRes .mov", "WebM"];
  const [customFormat, setCustomFormat] = useState("");
  const [previewParts, setPreviewParts] = useState([
    "Client",
    "Project Name",
    creativeUnitLabel,
    ":30",
    "16x9",
  ]);
  const [customPreviewText, setCustomPreviewText] = useState("");
  const [draggingPreviewIndex, setDraggingPreviewIndex] = useState<number | null>(
    null,
  );
  const options = Array.from(
    new Set([...baseFormats, ...formats.map(normalizeOutputFormatLabel)]),
  );

  function toggleFormat(format: string) {
    const nextFormats = formats.includes(format)
      ? formats.filter((item) => item !== format)
      : [...formats, format];
    onOutputChange(nextFormats.length ? nextFormats : ["h.264 .mp4"], autoApply);
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

  function movePreviewPartTo(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }

    setPreviewParts((current) => {
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  function addPreviewText() {
    const value = customPreviewText.trim();

    if (!value) {
      return;
    }

    setPreviewParts((current) => [...current, value]);
    setCustomPreviewText("");
  }

  return (
    <section className="dt-panel overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Project setup</h2>
        <button
          className="dt-btn h-7 px-2"
          onClick={() => setIsCollapsed((current) => !current)}
          type="button"
        >
          <ChevronRight
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}
          />
          {isCollapsed ? "Show" : "Hide"}
        </button>
      </div>
      {isCollapsed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {getTaxonomyFlow(enabledForkTypes).map((type) => (
            <span className="dt-chip" key={type}>
              {getNodeTypeLabel(type, creativeUnitLabel)}
            </span>
          ))}
        </div>
      ) : null}
      {!isCollapsed ? (
        <>
      <div className="dt-segment dt-segment-equal mt-4 w-full">
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
            These formats populate new deliverable file branches when auto-populate is on.
          </p>
          <div className="mt-4 grid gap-2">
            {options.map((format) => (
              <label
                className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1 text-xs text-[var(--ink-2)]"
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
              className="dt-input h-8 min-w-0 flex-1 py-1 text-xs"
              onChange={(event) => setCustomFormat(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addCustomFormat();
                }
              }}
              placeholder="custom format"
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
                  className="dt-input h-8 w-full min-w-0 max-w-full truncate py-1 text-xs"
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
                  <option value=" ">Space: client project name</option>
                </select>
              </label>
              <label className="dt-field">
                Case
                <select
                  className="dt-input h-8 w-full min-w-0 max-w-full truncate py-1 text-xs"
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
                <div className="mono mt-1 break-all text-xs text-[var(--ink-2)]">
                  {formatFilenameParts(
                    previewParts,
                    {
                      caseStyle: filenameCase,
                      separator: filenameSeparator,
                    },
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {previewParts.map((part, index) => (
                    <span
                      className={`inline-flex cursor-grab items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-panel)] px-2 py-1 text-[11px] text-[var(--ink-2)] ${
                        draggingPreviewIndex === index ? "opacity-45" : ""
                      }`}
                      draggable
                      key={`${part}-${index}`}
                      onDragEnd={() => setDraggingPreviewIndex(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => setDraggingPreviewIndex(index)}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggingPreviewIndex !== null) {
                          movePreviewPartTo(draggingPreviewIndex, index);
                        }
                        setDraggingPreviewIndex(null);
                      }}
                    >
                      <span className="text-[var(--ink-4)]">⋮⋮</span>
                      <span className="mono">{part}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="dt-input h-8 min-w-0 flex-1 py-1 text-xs"
                    onChange={(event) => setCustomPreviewText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addPreviewText();
                      }
                    }}
                    placeholder="custom text"
                    value={customPreviewText}
                  />
                  <button className="dt-btn h-8 px-2" onClick={addPreviewText} type="button">
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="dt-sub">
            Rename Creative Unit if this project thinks in scripts, spots, markets,
            vignettes, or another top-level organizing idea. Output Format is
            always present. Enable only the
            fork levels this project needs.
          </p>
          <div className="grid gap-2">
            <label className="flex items-start gap-3 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--ink-2)]">
              <input checked disabled className="mt-1 opacity-40" type="checkbox" />
              <span className="mt-0.5 text-[var(--ink-3)]">
                <NodeGlyph label={creativeUnitLabel} nodeType="creative_unit" />
              </span>
              <span className="min-w-0 flex-1">
                <input
                  className="dt-input h-8 w-full min-w-0 py-1 text-xs font-medium"
                  onBlur={(event) => onCreativeUnitLabelChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onCreativeUnitLabelChange(event.currentTarget.value);
                      event.currentTarget.blur();
                    }
                  }}
                  defaultValue={creativeUnitLabel}
                />
                <span className="dt-sub mt-1 block">
                  Always present. Rename this to match your project language.
                </span>
              </span>
            </label>
            {taxonomyOptions.map((option) => (
              <label
                className="flex items-start gap-3 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--ink-2)]"
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
                    {getNodeTypeLabel(option.type, creativeUnitLabel)}
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
                  <span className="dt-chip">{getNodeTypeLabel(type, creativeUnitLabel)}</span>
                  {index < path.length - 1 ? (
                    <ChevronRight className="h-3 w-3 text-[var(--ink-4)]" />
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
        </>
      ) : null}
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
        <span className="dt-chip h-auto max-w-[180px] whitespace-normal py-1 leading-4">
          {isPending ? "saving" : status}
        </span>
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

function AiAssistantPanel({
  acceptedSuggestionIds,
  enabledForkTypes,
  inputText,
  isAnalyzing,
  onAccept,
  onAnalyze,
  onInputText,
  onReject,
  onSnapshot,
  rejectedSuggestionIds,
  result,
  status,
  tree,
}: {
  acceptedSuggestionIds: Set<string>;
  enabledForkTypes: MatrixNodeType[];
  inputText: string;
  isAnalyzing: boolean;
  onAccept: (suggestion: AiSuggestion, draft: AiApplyDraft) => void;
  onAnalyze: () => void;
  onInputText: (value: string) => void;
  onReject: (suggestionId: string) => void;
  onSnapshot: () => void;
  rejectedSuggestionIds: Set<string>;
  result: AiIntakeResult | null;
  status: string;
  tree: DeliverableTree;
}) {
  const resultRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const openSuggestionCount =
    result?.additions.filter(
      (suggestion) =>
        !acceptedSuggestionIds.has(suggestion.id) &&
        !rejectedSuggestionIds.has(suggestion.id),
    ).length ?? 0;

  useEffect(() => {
    if (result) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  return (
    <section className="dt-panel min-w-0 overflow-hidden">
      <div className="dt-ai-sheen h-1.5" />
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">AI Assistant</h2>
            {isCollapsed && openSuggestionCount ? (
              <p className="dt-sub mt-1">{openSuggestionCount} suggestions ready</p>
            ) : null}
          </div>
          <button
            className="dt-btn h-7 px-2"
            onClick={() => setIsCollapsed((current) => !current)}
            type="button"
          >
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}
            />
            {isCollapsed ? "Show" : "Hide"}
          </button>
        </div>
        {!isCollapsed ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="min-w-0">
              <p className="dt-sub">
                Paste client notes or brief language. Suggestions stay local until you
                accept them and save.
              </p>
              <textarea
                className="dt-input mt-3 min-h-56 w-full resize-y text-[11px] leading-4 shadow-inner"
                onChange={(event) => {
                  onInputText(event.target.value);
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 520)}px`;
                }}
                placeholder="Paste client email, brief notes, or scope language..."
                rows={10}
                value={inputText}
              />
              <button
                className={`dt-btn primary mt-3 w-full justify-center ${isAnalyzing ? "dt-loading" : ""}`}
                disabled={isAnalyzing}
                onClick={onAnalyze}
                type="button"
              >
                <Sparkles className="h-4 w-4" />
                {isAnalyzing ? "Analyzing..." : "Analyze pasted text"}
              </button>
              {status ? <p className="dt-sub mt-2">{status}</p> : null}
              {result ? (
                <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-subtle)] p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    Summary
                  </h3>
                  <p className="mt-2 text-sm leading-5 text-[var(--ink-2)]">
                    {result.summary}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="min-w-0" ref={resultRef}>
              {result ? (
                <div className="grid gap-4">
                  <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-subtle)] p-3">
                    <p className="text-xs leading-5 text-[var(--ink-3)]">
                      Snapshot the current matrix before accepting AI changes if you
                      want a clean before/after comparison.
                    </p>
                    <button
                      className="dt-btn mt-2 w-full justify-center"
                      onClick={onSnapshot}
                      type="button"
                    >
                      Snapshot current state
                    </button>
                  </div>
                  <SuggestionList
                    acceptedSuggestionIds={acceptedSuggestionIds}
                    enabledForkTypes={enabledForkTypes}
                    onAccept={onAccept}
                    onReject={onReject}
                    rejectedSuggestionIds={rejectedSuggestionIds}
                    suggestions={result.additions}
                    tree={tree}
                  />
                  <AiNotes title="Possible changes/removals" notes={result.removalsOrChanges} />
                  <AiNotes title="Assumptions" notes={result.assumptions} />
                  <AiNotes copyable title="Client questions" notes={result.questions} />
                </div>
              ) : (
                <div className="flex min-h-56 items-center justify-center rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-subtle)] p-5 text-center">
                  <p className="max-w-sm text-sm leading-6 text-[var(--ink-3)]">
                    Suggested matrix changes, client questions, and source logic
                    will appear here after analysis.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SuggestionList({
  acceptedSuggestionIds,
  enabledForkTypes,
  onAccept,
  onReject,
  rejectedSuggestionIds,
  suggestions,
  tree,
}: {
  acceptedSuggestionIds: Set<string>;
  enabledForkTypes: MatrixNodeType[];
  onAccept: (suggestion: AiSuggestion, draft: AiApplyDraft) => void;
  onReject: (suggestionId: string) => void;
  rejectedSuggestionIds: Set<string>;
  suggestions: AiSuggestion[];
  tree: DeliverableTree;
}) {
  const [expandedSuggestionIds, setExpandedSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [drafts, setDrafts] = useState<Record<string, AiApplyDraft>>({});
  const [copiedSuggestionId, setCopiedSuggestionId] = useState<string | null>(
    null,
  );
  const sortedSuggestions = [...suggestions].sort((first, second) => {
    const firstDone =
      acceptedSuggestionIds.has(first.id) || rejectedSuggestionIds.has(first.id);
    const secondDone =
      acceptedSuggestionIds.has(second.id) || rejectedSuggestionIds.has(second.id);

    if (firstDone !== secondDone) {
      return firstDone ? 1 : -1;
    }

    return suggestionHierarchyRank(first) - suggestionHierarchyRank(second);
  });

  function toggleLogic(suggestionId: string) {
    setExpandedSuggestionIds((current) => {
      const next = new Set(current);

      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }

      return next;
    });
  }

  async function copyConfirmation(suggestion: AiSuggestion) {
    await navigator.clipboard.writeText(suggestion.confirmationLanguage);
    setCopiedSuggestionId(suggestion.id);
    window.setTimeout(() => setCopiedSuggestionId(null), 1200);
  }

  function draftForSuggestion(suggestion: AiSuggestion) {
    return drafts[suggestion.id] ?? getInitialAiApplyDraft(suggestion);
  }

  function updateDraft(suggestionId: string, patch: Partial<AiApplyDraft>) {
    setDrafts((current) => {
      const suggestion = suggestions.find((item) => item.id === suggestionId);
      const currentDraft =
        current[suggestionId] ??
        (suggestion ? getInitialAiApplyDraft(suggestion) : null);

      if (!currentDraft) {
        return current;
      }

      return {
        ...current,
        [suggestionId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
        Suggested additions
      </h3>
      {suggestions.length ? (
        <div className="mt-2 grid gap-2">
          {sortedSuggestions.map((suggestion) => {
            const accepted = acceptedSuggestionIds.has(suggestion.id);
            const rejected = rejectedSuggestionIds.has(suggestion.id);
            const expanded = expandedSuggestionIds.has(suggestion.id);
            const done = accepted || rejected;
            const draft = draftForSuggestion(suggestion);
            const plan = resolveAiApplyPlan(
              tree.nodes,
              suggestion,
              draft,
              enabledForkTypes,
            );
            const draftCount = plan.labels.length;
            const canAccept = !done && !plan.blockedReason;

            return (
              <div
                className={`rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-panel)] p-3 transition ${
                  done ? "opacity-55" : ""
                }`}
                key={suggestion.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink-1)]">
                      {suggestion.title}
                    </p>
                    <p className="dt-sub mt-1">{suggestion.reason}</p>
                  </div>
                  <ConfidenceChip confidence={suggestion.confidence} />
                </div>
                <p className="mono mt-2 break-words text-[10.5px] leading-5 text-[var(--ink-3)]">
                  {suggestion.path.map((item) => item.label).join(" → ")}
                </p>
                <div className="mt-3 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-subtle)] p-2">
                  <div className="grid gap-2">
                    <label className="dt-field text-[11px]">
                      Add
                      <select
                        className="dt-input h-8 w-full min-w-0 py-1 text-xs"
                        disabled={done}
                        onChange={(event) =>
                          updateDraft(suggestion.id, {
                            nodeType: event.target.value as MatrixNodeType,
                          })
                        }
                        value={draft.nodeType}
                      >
                        {allNodeTypes.map((type) => (
                          <option key={type} value={type}>
                            {nodeTypeLabels[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="dt-field text-[11px]">
                      Values
                      <textarea
                        className="dt-input min-h-16 w-full resize-y py-1 text-xs leading-5"
                        disabled={done}
                        onChange={(event) =>
                          updateDraft(suggestion.id, {
                            labelsText: event.target.value,
                          })
                        }
                        value={draft.labelsText}
                      />
                    </label>
                    <label className="dt-field text-[11px]">
                      Apply to
                      <select
                        className="dt-input h-8 w-full min-w-0 py-1 text-xs"
                        disabled={done || draft.nodeType === "creative_unit"}
                        onChange={(event) =>
                          updateDraft(suggestion.id, {
                            target: event.target.value as AiApplyDraft["target"],
                          })
                        }
                        value={
                          draft.nodeType === "creative_unit"
                            ? "suggested_path"
                            : draft.target
                        }
                      >
                        <option value="all_creative_units">
                          All current top-level items
                        </option>
                        <option value="suggested_path">Suggested path only</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--ink-3)]">
                    {plan.blockedReason ??
                      `Add ${draftCount} ${getNodeTypeLabel(draft.nodeType, "Creative Unit")}${draftCount === 1 ? "" : "s"} across ${plan.targetCount} target branch${plan.targetCount === 1 ? "" : "es"}.`}
                  </p>
                  {plan.previewTargets.length ? (
                    <div className="mono mt-2 grid gap-1 text-[10px] leading-4 text-[var(--ink-3)]">
                      {plan.previewTargets.map((target) => (
                        <span className="truncate" key={target}>
                          {target}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="mt-3 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-subtle)] p-2">
                    <p className="text-xs font-medium text-[var(--ink-2)]">
                      Source logic
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">
                      {suggestion.reason}
                    </p>
                    {suggestion.sourceExcerpt ? (
                      <p className="mt-2 border-l-2 border-[var(--accent)] pl-2 text-xs leading-5 text-[var(--ink-2)]">
                        {suggestion.sourceExcerpt}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    className="dt-btn"
                    onClick={() => toggleLogic(suggestion.id)}
                    type="button"
                  >
                    {expanded ? "Hide logic" : "Show logic"}
                  </button>
                  <button
                    className="dt-btn"
                    onClick={() => copyConfirmation(suggestion)}
                    type="button"
                  >
                    {copiedSuggestionId === suggestion.id
                      ? "Copied"
                      : "Confirm wording"}
                  </button>
                  <button
                    className="dt-btn"
                    disabled={accepted || rejected}
                    onClick={() => onReject(suggestion.id)}
                    type="button"
                  >
                    {rejected ? "Rejected" : "Reject"}
                  </button>
                  <button
                    className="dt-btn primary"
                    disabled={!canAccept}
                    onClick={() => onAccept(suggestion, draft)}
                    type="button"
                  >
                    {accepted ? "Accepted" : "Accept"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="dt-sub mt-2">No concrete additions suggested.</p>
      )}
    </div>
  );
}

function AiNotes({
  copyable = false,
  notes,
  title,
}: {
  copyable?: boolean;
  notes: AiIntakeResult["questions"];
  title: string;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!notes.length) {
    return null;
  }

  async function copyNote(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1200);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {title}
        </h3>
      </div>
      <div className="mt-2 grid gap-2">
        {notes.map((note, index) => (
          <div
            className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-panel)] p-3"
            key={`${title}-${index}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm leading-5 text-[var(--ink-2)]">{note.text}</p>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <ConfidenceChip confidence={note.confidence} />
                {copyable ? (
                  <button
                    className="dt-btn h-7 px-2"
                    onClick={() => copyNote(note.text, index)}
                    type="button"
                  >
                    {copiedIndex === index ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceChip({ confidence }: { confidence: AiConfidence }) {
  const label = `${confidence} confidence`;

  return (
    <span className="mono shrink-0 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
      {label}
    </span>
  );
}

function ExportPanel({
  enumerateDeliverables,
  filenameCase,
  filenameSeparator,
  includeTechnical,
  onEnumerateDeliverables,
  onIncludeTechnical,
  project,
  tree,
}: {
  enumerateDeliverables: boolean;
  filenameCase: FilenameCase;
  filenameSeparator: FilenameSeparator;
  includeTechnical: boolean;
  onEnumerateDeliverables: (enumerateDeliverables: boolean) => void;
  onIncludeTechnical: (includeTechnical: boolean) => void;
  project: Project;
  tree: DeliverableTree;
}) {
  const [showTextExport, setShowTextExport] = useState(false);
  const [showSheetsExport, setShowSheetsExport] = useState(false);
  const [showGoogleAuthModal, setShowGoogleAuthModal] = useState(false);
  const [sheetsMode, setSheetsMode] = useState<SheetsExportMode>("creative");
  const [copyStatus, setCopyStatus] = useState("Copy all");
  const [googleExportStatus, setGoogleExportStatus] = useState("");
  const [isGoogleExporting, setIsGoogleExporting] = useState(false);
  const [sheetsCopyStatus, setSheetsCopyStatus] = useState("Copy for Sheets");
  const counts = calculateCounts(tree);
  const csvPaths = collectExportPaths(tree, project, {
    caseStyle: filenameCase,
    includeTechnical: true,
    separator: filenameSeparator,
  });
  const textExport = buildTextTreeExport({
    counts,
    enumerateDeliverables,
    includeTechnical,
    project,
    tree,
  });
  const sheetsExport = buildSheetsExport({
    mode: sheetsMode,
    paths: csvPaths,
  });

  async function copyTextExport() {
    await navigator.clipboard.writeText(textExport);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus("Copy all"), 1200);
  }

  async function copySheetsExport() {
    await navigator.clipboard.writeText(sheetsExport);
    setSheetsCopyStatus("Copied");
    window.setTimeout(() => setSheetsCopyStatus("Copy for Sheets"), 1200);
  }

  function exportMatrix(format: ExportFormat) {
    const content = buildExportContent({
      format,
      paths: csvPaths,
    });
    const baseName = formatFilenameParts(
      [project.client_name, project.name, "deliverables"].filter(Boolean) as string[],
      { caseStyle: filenameCase, separator: filenameSeparator },
    );

    downloadTextFile(content, `${baseName}.${format}`, "text/csv;charset=utf-8");
  }

  function downloadSheetsExport() {
    const baseName = formatFilenameParts(
      [
        project.client_name,
        project.name,
        sheetsMode === "creative" ? "creative-matrix" : "deliverable-files",
      ].filter(Boolean) as string[],
      { caseStyle: filenameCase, separator: filenameSeparator },
    );

    downloadTextFile(
      sheetsExport,
      `${baseName}.tsv`,
      "text/tab-separated-values;charset=utf-8",
    );
  }

  function downloadFolderTree() {
    const rootName = formatFilenameParts(
      [project.client_name, project.name].filter(Boolean) as string[],
      { caseStyle: filenameCase, separator: filenameSeparator },
    );
    const folderPaths = collectFolderTreePaths(tree, rootName || "deliverables");
    const zip = createFolderZip(folderPaths);

    downloadBlob(zip, `${rootName || "deliverables"}-folders.zip`);
  }

  async function exportToGoogleSheets() {
    setGoogleExportStatus("");
    setIsGoogleExporting(true);

    try {
      const statusResponse = await fetch("/api/google/sheets/status");
      const googleStatus = (await statusResponse.json()) as {
        configured: boolean;
        connected: boolean;
      };

      if (!googleStatus.configured) {
        setGoogleExportStatus(
          "Google export needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET configured first.",
        );
        setShowGoogleAuthModal(true);
        return;
      }

      if (!googleStatus.connected) {
        setShowGoogleAuthModal(true);
        return;
      }

      const exportResponse = await fetch("/api/google/sheets/export", {
        body: JSON.stringify({
          filenameCase,
          filenameSeparator,
          project,
          tree,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const result = (await exportResponse.json()) as {
        error?: string;
        needsAuth?: boolean;
        spreadsheetUrl?: string;
      };

      if (result.needsAuth) {
        setShowGoogleAuthModal(true);
        return;
      }

      if (!exportResponse.ok || !result.spreadsheetUrl) {
        throw new Error(result.error ?? "Could not export to Google Sheets.");
      }

      window.open(result.spreadsheetUrl, "_blank", "noopener,noreferrer");
      setGoogleExportStatus("Google Sheet created.");
    } catch (error) {
      setGoogleExportStatus(
        error instanceof Error ? error.message : "Could not export to Google Sheets.",
      );
    } finally {
      setIsGoogleExporting(false);
    }
  }

  function connectGoogle() {
    const returnTo = `${window.location.pathname}${window.location.search}`;

    window.location.href = `/api/google/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  return (
    <section className="dt-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Exports</h2>
        <Download className="h-4 w-4 text-[var(--ink-3)]" />
      </div>
      <p className="dt-sub mt-2">
        Export the current matrix as a working producer summary.
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm text-[var(--ink-2)]">
        <input
          checked={includeTechnical}
          className="mt-1"
          onChange={(event) => onIncludeTechnical(event.target.checked)}
          type="checkbox"
        />
        Include technical variants in client-facing paths.
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm text-[var(--ink-2)]">
        <input
          checked={enumerateDeliverables}
          className="mt-1"
          onChange={(event) => onEnumerateDeliverables(event.target.checked)}
          type="checkbox"
        />
        Enumerate deliverables.
      </label>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          className="dt-btn justify-center"
          onClick={() => setShowTextExport(true)}
          type="button"
        >
          Text
        </button>
        <button
          className="dt-btn justify-center"
          onClick={() => setShowSheetsExport(true)}
          type="button"
        >
          Sheets
        </button>
        <button
          className="dt-btn justify-center"
          onClick={downloadFolderTree}
          type="button"
        >
          Folders
        </button>
      </div>
      <button
        className="hidden"
        onClick={() => exportMatrix("csv")}
        type="button"
      >
        CSV
      </button>
      <button
        className="dt-btn primary mt-2 w-full justify-center"
        disabled={isGoogleExporting}
        onClick={exportToGoogleSheets}
        type="button"
      >
        <ExternalLink className="h-4 w-4" />
        {isGoogleExporting ? "Creating Google Sheet..." : "Export to Google Sheets"}
      </button>
      {googleExportStatus ? (
        <p className="dt-sub mt-2">{googleExportStatus}</p>
      ) : null}
      <div className="mono mt-3 text-[10.5px] text-[var(--ink-3)]">
        {csvPaths.length} deliverable file rows ready
      </div>
      {showTextExport ? (
        <Modal
          maxWidthClassName="max-w-5xl"
          onClose={() => setShowTextExport(false)}
          title="Plain text export"
        >
          <div className="grid gap-3">
            <textarea
              className="dt-input mono h-[82vh] min-h-[640px] resize-y whitespace-pre text-[9px] leading-snug"
              readOnly
              value={textExport}
            />
            <div className="flex justify-end gap-2">
              <button
                className="dt-btn"
                onClick={() => setShowTextExport(false)}
                type="button"
              >
                Close
              </button>
              <button className="dt-btn primary" onClick={copyTextExport} type="button">
                {copyStatus}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showGoogleAuthModal ? (
        <Modal
          maxWidthClassName="max-w-lg"
          onClose={() => setShowGoogleAuthModal(false)}
          title="Connect Google"
        >
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-[var(--ink-2)]">
              Google Sheets export creates a new spreadsheet in your Google
              Drive with formatted tabs, dropdowns, checkboxes, and counts.
            </p>
            {googleExportStatus ? (
              <p className="dt-sub">{googleExportStatus}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                className="dt-btn"
                onClick={() => setShowGoogleAuthModal(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="dt-btn primary"
                disabled={googleExportStatus.includes("GOOGLE_CLIENT")}
                onClick={connectGoogle}
                type="button"
              >
                Connect Google
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showSheetsExport ? (
        <Modal
          maxWidthClassName="max-w-5xl"
          onClose={() => setShowSheetsExport(false)}
          title="Google Sheets export"
        >
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                className={`dt-btn ${sheetsMode === "creative" ? "primary" : ""}`}
                onClick={() => setSheetsMode("creative")}
                type="button"
              >
                Creative matrix
              </button>
              <button
                className={`dt-btn ${sheetsMode === "terminal" ? "primary" : ""}`}
                onClick={() => setSheetsMode("terminal")}
                type="button"
              >
                Deliverable files
              </button>
            </div>
            <textarea
              className="dt-input mono h-[68vh] min-h-[520px] resize-y whitespace-pre text-[10px] leading-snug"
              readOnly
              value={sheetsExport}
            />
            <div className="flex justify-end gap-2">
              <button
                className="dt-btn"
                onClick={() => setShowSheetsExport(false)}
                type="button"
              >
                Close
              </button>
              <button className="dt-btn" onClick={downloadSheetsExport} type="button">
                Download TSV
              </button>
              <button
                className="dt-btn primary"
                onClick={copySheetsExport}
                type="button"
              >
                {sheetsCopyStatus}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function SnapshotComparePanel({
  diff,
  onSnapshot,
  selectedSnapshotId,
  snapshot,
  snapshots,
}: {
  diff: SnapshotDiff | null;
  onSnapshot: (snapshotId: string) => void;
  selectedSnapshotId: string;
  snapshot: MatrixSnapshot | null;
  snapshots: MatrixSnapshot[];
}) {
  return (
    <section className="dt-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Compare</h2>
        <GitCompareArrows className="h-4 w-4 text-[var(--ink-3)]" />
      </div>

      {snapshots.length ? (
        <>
          <label className="dt-field mt-4">
            Snapshot
            <select
              className="dt-input"
              onChange={(event) => onSnapshot(event.target.value)}
              value={selectedSnapshotId}
            >
              {snapshots.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {snapshot ? (
            <p className="mono mt-2 text-[10.5px] text-[var(--ink-3)]">
              Comparing {new Date(snapshot.created_at).toLocaleString()} to
              current unsaved state.
            </p>
          ) : null}

          {diff ? (
            <div className="mt-4 grid gap-4">
              <div className="grid grid-cols-2 gap-2">
                <CompareCountCard
                  after={diff.afterCounts.creativeDeliverables}
                  before={diff.beforeCounts.creativeDeliverables}
                  label="Creative"
                />
                <CompareCountCard
                  after={diff.afterCounts.terminalFiles}
                  before={diff.beforeCounts.terminalFiles}
                  label="Files"
                />
              </div>

              <TypeDeltaGrid
                afterCounts={diff.afterTypeCounts}
                beforeCounts={diff.beforeTypeCounts}
              />

              <DiffList
                entries={diff.added}
                icon={<Plus className="h-3.5 w-3.5" />}
                title="Added"
                tone="add"
              />
              <DiffList
                entries={diff.removed}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                title="Removed"
                tone="remove"
              />
              <ChangedList entries={diff.changed} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="dt-sub mt-3">
          Save a snapshot, then compare it against the current matrix.
        </p>
      )}
    </section>
  );
}

function CompareCountCard({
  after,
  before,
  label,
}: {
  after: number;
  before: number;
  label: string;
}) {
  const delta = after - before;

  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] p-3">
      <div className="dt-eyebrow">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="tnum text-xl font-semibold">{after}</span>
        <span
          className={`mono text-xs ${
            delta > 0
              ? "text-[#547000]"
              : delta < 0
                ? "text-[#a33127]"
                : "text-[var(--ink-4)]"
          }`}
        >
          {formatDelta(delta)}
        </span>
      </div>
      <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
        was {before}
      </div>
    </div>
  );
}

function TypeDeltaGrid({
  afterCounts,
  beforeCounts,
}: {
  afterCounts: Record<MatrixNodeType, number>;
  beforeCounts: Record<MatrixNodeType, number>;
}) {
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] p-3">
      <div className="dt-eyebrow">Branch deltas</div>
      <div className="mt-2 grid gap-1.5">
        {allNodeTypes.map((type) => {
          const before = beforeCounts[type];
          const after = afterCounts[type];
          const delta = after - before;

          return (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs"
              key={type}
            >
              <span className="truncate text-[var(--ink-2)]">
                {nodeTypeLabels[type]}
              </span>
              <span className="mono text-[var(--ink-3)]">
                {before}
                {" -> "}
                {after}
              </span>
              <span
                className={`mono ${
                  delta > 0
                    ? "text-[#547000]"
                    : delta < 0
                      ? "text-[#a33127]"
                      : "text-[var(--ink-4)]"
                }`}
              >
                {formatDelta(delta)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffList({
  entries,
  icon,
  title,
  tone,
}: {
  entries: SnapshotDiffEntry[];
  icon: ReactNode;
  title: string;
  tone: "add" | "remove";
}) {
  const visibleEntries = entries.slice(0, 6);
  const extra = entries.length - visibleEntries.length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="dt-eyebrow">{title}</span>
        <span className="dt-chip">{entries.length}</span>
      </div>
      {visibleEntries.length ? (
        <div className="grid gap-1.5">
          {visibleEntries.map((entry) => (
            <div
              className="flex min-w-0 items-start gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1.5 text-xs"
              key={entry.id}
            >
              <span
                className={
                  tone === "add"
                    ? "mt-0.5 text-[#547000]"
                    : "mt-0.5 text-[#a33127]"
                }
              >
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-[var(--ink-1)]">
                  {entry.label}
                </span>
                <span className="block truncate text-[var(--ink-3)]">
                  {entry.pathText}
                </span>
              </span>
            </div>
          ))}
          {extra > 0 ? (
            <div className="mono text-[10.5px] text-[var(--ink-3)]">
              +{extra} more
            </div>
          ) : null}
        </div>
      ) : (
        <p className="dt-sub">No {title.toLowerCase()} branches.</p>
      )}
    </div>
  );
}

function ChangedList({ entries }: { entries: SnapshotChangeEntry[] }) {
  const visibleEntries = entries.slice(0, 6);
  const extra = entries.length - visibleEntries.length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="dt-eyebrow">Changed</span>
        <span className="dt-chip">{entries.length}</span>
      </div>
      {visibleEntries.length ? (
        <div className="grid gap-1.5">
          {visibleEntries.map((entry) => (
            <div
              className="flex min-w-0 items-start gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1.5 text-xs"
              key={entry.after.id}
            >
              <Pencil className="mt-0.5 h-3.5 w-3.5 text-[var(--ink-3)]" />
              <span className="min-w-0">
                <span className="block font-medium text-[var(--ink-1)]">
                  {entry.before.label}
                  {" -> "}
                  {entry.after.label}
                </span>
                <span className="block truncate text-[var(--ink-3)]">
                  {entry.after.pathText}
                </span>
              </span>
            </div>
          ))}
          {extra > 0 ? (
            <div className="mono text-[10.5px] text-[var(--ink-3)]">
              +{extra} more
            </div>
          ) : null}
        </div>
      ) : (
        <p className="dt-sub">No renamed branches.</p>
      )}
    </div>
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
  maxWidthClassName = "max-w-lg",
  onClose,
  title,
}: {
  children: ReactNode;
  maxWidthClassName?: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,24,21,0.28)] p-4">
      <div
        className={`dt-panel w-full bg-[var(--bg-panel)] p-5 shadow-[var(--shadow-pop)] ${maxWidthClassName}`}
      >
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

function ProjectDetailsModal({
  campaignName,
  clientName,
  description,
  isPending,
  name,
  onCampaignName,
  onClientName,
  onClose,
  onDescription,
  onName,
  onSave,
}: {
  campaignName: string;
  clientName: string;
  description: string;
  isPending: boolean;
  name: string;
  onCampaignName: (name: string) => void;
  onClientName: (name: string) => void;
  onClose: () => void;
  onDescription: (description: string) => void;
  onName: (name: string) => void;
  onSave: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Edit project">
      <div className="grid gap-4">
        <label className="dt-field">
          Client name
          <input
            autoFocus
            className="dt-input"
            onChange={(event) => onClientName(event.target.value)}
            placeholder="Client"
            value={clientName}
          />
        </label>
        <label className="dt-field">
          Project name
          <input
            className="dt-input"
            onChange={(event) => onName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) {
                onSave();
              }
            }}
            placeholder="Project / Campaign"
            value={name}
          />
        </label>
        <label className="dt-field">
          Campaign name
          <input
            className="dt-input"
            onChange={(event) => onCampaignName(event.target.value)}
            placeholder="Optional campaign label"
            value={campaignName}
          />
        </label>
        <label className="dt-field">
          Description
          <textarea
            className="dt-input min-h-20"
            onChange={(event) => onDescription(event.target.value)}
            placeholder="Project notes or scope context"
            value={description}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button className="dt-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="dt-btn primary"
            disabled={isPending || !name.trim()}
            onClick={onSave}
            type="button"
          >
            Save project
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SnapshotModal({
  isPending,
  notes,
  onClose,
  onNotes,
  onSave,
  onSnapshotName,
  snapshotName,
}: {
  isPending: boolean;
  notes: string;
  onClose: () => void;
  onNotes: (notes: string) => void;
  onSave: () => void;
  onSnapshotName: (name: string) => void;
  snapshotName: string;
}) {
  return (
    <Modal onClose={onClose} title="Save snapshot">
      <div className="grid gap-4">
        <label className="dt-field">
          Snapshot name
          <input
            autoFocus
            className="dt-input"
            onChange={(event) => onSnapshotName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSave();
              }
            }}
            placeholder="Post-Kickoff Update"
            value={snapshotName}
          />
        </label>
        <label className="dt-field">
          Notes
          <textarea
            className="dt-input min-h-20"
            onChange={(event) => onNotes(event.target.value)}
            placeholder="What changed or why this version matters"
            value={notes}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button className="dt-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="dt-btn primary"
            disabled={isPending || !snapshotName.trim()}
            onClick={onSave}
            type="button"
          >
            Save snapshot
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddVersionsModal({
  addableTypes,
  creativeUnitLabel,
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
  creativeUnitLabel: string;
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
    if (type === "technical_variant" && label === technicalStandardLabel) {
      return;
    }

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
                {getNodeTypeLabel(item, creativeUnitLabel)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="dt-eyebrow mb-2">Presets</div>
          {type === "technical_variant" ? (
            <p className="dt-sub mb-2">
              Technical variants sit beside a normal version. The standard path is
              always preserved, then any additional variants are added alongside it.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {presets.map((label) => {
              const isFixedStandard =
                type === "technical_variant" && label === technicalStandardLabel;

              return (
                <label
                  className={`inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1 text-sm ${
                    isFixedStandard
                      ? "cursor-not-allowed opacity-65"
                      : "cursor-pointer"
                  }`}
                  key={label}
                >
                  <input
                    checked={isFixedStandard || presetLabels.includes(label)}
                    disabled={isFixedStandard}
                    onChange={() => togglePreset(label)}
                    type="checkbox"
                  />
                  <span className="mono">{label}</span>
                </label>
              );
            })}
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

function collectOpenIds(node: DeliverableNode, ids: Set<string>) {
  if (node.children?.length) {
    ids.add(node.id);
    node.children.forEach((child) => collectOpenIds(child, ids));
  }
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

function compareTrees(
  beforeTree: DeliverableTree,
  afterTree: DeliverableTree,
): SnapshotDiff {
  const beforeEntries = collectDiffEntries(beforeTree.nodes);
  const afterEntries = collectDiffEntries(afterTree.nodes);
  const added: SnapshotDiffEntry[] = [];
  const removed: SnapshotDiffEntry[] = [];
  const changed: SnapshotChangeEntry[] = [];

  afterEntries.forEach((afterEntry, id) => {
    const beforeEntry = beforeEntries.get(id);

    if (!beforeEntry) {
      added.push(afterEntry);
      return;
    }

    if (
      beforeEntry.label !== afterEntry.label ||
      beforeEntry.nodeType !== afterEntry.nodeType
    ) {
      changed.push({ after: afterEntry, before: beforeEntry });
    }
  });

  beforeEntries.forEach((beforeEntry, id) => {
    if (!afterEntries.has(id)) {
      removed.push(beforeEntry);
    }
  });

  return {
    added: sortDiffEntries(added),
    afterCounts: calculateCounts(afterTree),
    afterTypeCounts: countNodeTypes(afterTree.nodes),
    beforeCounts: calculateCounts(beforeTree),
    beforeTypeCounts: countNodeTypes(beforeTree.nodes),
    changed: changed.sort((first, second) =>
      first.after.pathText.localeCompare(second.after.pathText),
    ),
    removed: sortDiffEntries(removed),
  };
}

function collectDiffEntries(nodes: DeliverableNode[]) {
  const entries = new Map<string, SnapshotDiffEntry>();

  function walk(node: DeliverableNode, path: string[]) {
    const nextPath = [...path, node.label];
    entries.set(node.id, {
      id: node.id,
      label: node.label,
      nodeType: node.nodeType,
      pathText: nextPath.join(" / "),
    });
    node.children?.forEach((child) => walk(child, nextPath));
  }

  nodes.forEach((node) => walk(node, []));

  return entries;
}

function sortDiffEntries(entries: SnapshotDiffEntry[]) {
  return entries.sort((first, second) =>
    first.pathText.localeCompare(second.pathText),
  );
}

function countNodeTypes(nodes: DeliverableNode[]) {
  const counts = Object.fromEntries(
    allNodeTypes.map((type) => [type, 0]),
  ) as Record<MatrixNodeType, number>;

  function walk(node: DeliverableNode) {
    counts[node.nodeType] += 1;
    node.children?.forEach(walk);
  }

  nodes.forEach(walk);

  return counts;
}

function formatDelta(delta: number) {
  if (delta > 0) {
    return `+${delta}`;
  }

  return String(delta);
}

function collectExportPaths(
  tree: DeliverableTree,
  project: Project,
  options: {
    caseStyle: FilenameCase;
    includeTechnical: boolean;
    separator: FilenameSeparator;
  },
) {
  const paths: ExportPath[] = [];

  function walk(node: DeliverableNode, path: DeliverableNode[]) {
    const nextPath = [...path, node];

    if (!node.children?.length) {
      if (node.nodeType === "output_format") {
        const visibleNodes = options.includeTechnical
          ? nextPath
          : nextPath.filter((item) => item.nodeType !== "technical_variant");
        paths.push({
          filename: suggestFilename({
            caseStyle: options.caseStyle,
            clientName: project.client_name,
            pathLabels: visibleNodes.map((item) => item.label),
            projectName: project.name,
            separator: options.separator,
          }),
          nodes: visibleNodes,
          pathText: visibleNodes.map((item) => item.label).join(" / "),
        });
      }
      return;
    }

    node.children.forEach((child) => walk(child, nextPath));
  }

  tree.nodes.forEach((node) => walk(node, []));

  return paths.sort((first, second) => first.filename.localeCompare(second.filename));
}

function buildExportContent({
  format,
  paths,
}: {
  format: ExportFormat;
  paths: ExportPath[];
}) {
  if (format === "csv") {
    return buildCsvExport(paths);
  }

  return "";
}

function collectFolderTreePaths(tree: DeliverableTree, rootName: string) {
  const paths = new Set<string>();
  const rootSegment = sanitizeFolderSegment(rootName);

  paths.add(rootSegment);

  function walk(node: DeliverableNode, parentSegments: string[]) {
    if (node.nodeType === "output_format") {
      return;
    }

    const shouldSkipSegment =
      node.nodeType === "technical_variant" && node.label === technicalStandardLabel;
    const nextSegments = shouldSkipSegment
      ? parentSegments
      : [...parentSegments, sanitizeFolderSegment(node.label)];
    const nextPath = nextSegments.join("/");

    paths.add(nextPath);
    node.children?.forEach((child) => walk(child, nextSegments));
  }

  tree.nodes.forEach((node) => walk(node, [rootSegment]));

  return Array.from(paths).sort((first, second) => {
    const firstDepth = first.split("/").length;
    const secondDepth = second.split("/").length;

    return firstDepth === secondDepth
      ? first.localeCompare(second)
      : firstDepth - secondDepth;
  });
}

function sanitizeFolderSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/^:(\d+)$/, "$1s")
    .replace(/[/:]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+$/, "")
    .trim();

  return sanitized || "untitled";
}

function buildTextTreeExport({
  counts,
  enumerateDeliverables,
  includeTechnical,
  project,
  tree,
}: {
  counts: ReturnType<typeof calculateCounts>;
  enumerateDeliverables: boolean;
  includeTechnical: boolean;
  project: Project;
  tree: DeliverableTree;
}) {
  const title = project.client_name
    ? `${project.client_name} - ${project.name}`
    : project.name;
  const treeLines = renderExportTree(tree.nodes, {
    enumerateDeliverables,
    includeTechnical,
  });
  const lines = [
    title,
    "",
    `Creative deliverables: ${counts.creativeDeliverables}`,
    `Deliverable files: ${counts.terminalFiles}`,
    `Technical variants: ${includeTechnical ? "included" : "hidden"}`,
    "",
    ...treeLines,
  ];

  return lines.join("\n");
}

function renderExportTree(
  nodes: DeliverableNode[],
  options: {
    enumerateDeliverables: boolean;
    includeTechnical: boolean;
  },
) {
  const counter = { value: 0 };
  const visibleNodes = nodes.flatMap((node) =>
    getVisibleExportNodes(node, options),
  );

  return visibleNodes.flatMap((node) =>
    renderExportNode({
      counter,
      depth: 0,
      isRoot: true,
      node,
      options,
    }),
  );
}

function renderExportNode({
  counter,
  depth,
  isRoot,
  node,
  options,
}: {
  counter: { value: number };
  depth: number;
  isRoot: boolean;
  node: DeliverableNode;
  options: {
    enumerateDeliverables: boolean;
    includeTechnical: boolean;
  };
}): string[] {
  const children = (node.children ?? []).flatMap((child) =>
    getVisibleExportNodes(child, options),
  );
  const terminalCount = countTerminalFilesInExportNode(node);
  const hiddenTerminalParent =
    options.enumerateDeliverables &&
    !options.includeTechnical &&
    node.nodeType !== "output_format" &&
    children.length === 0 &&
    terminalCount > 0;
  const outputLeaf = options.enumerateDeliverables && node.nodeType === "output_format";
  let enumeration: number | null = null;

  if (outputLeaf) {
    counter.value += 1;
    enumeration = counter.value;
  } else if (hiddenTerminalParent) {
    counter.value += terminalCount;
    enumeration = counter.value;
  }

  const label =
    enumeration === null
      ? node.label
      : `${node.label} (${enumeration})`;
  const line = isRoot ? label : `${"\t".repeat(depth)}→ ${label}`;

  return [
    line,
    ...children.flatMap((child) =>
      renderExportNode({
        counter,
        depth: depth + 1,
        isRoot: false,
        node: child,
        options,
      }),
    ),
  ];
}

function getVisibleExportNodes(
  node: DeliverableNode,
  options: {
    enumerateDeliverables: boolean;
    includeTechnical: boolean;
  },
): DeliverableNode[] {
  if (!options.includeTechnical && node.nodeType === "technical_variant") {
    return (node.children ?? []).flatMap((child) =>
      getVisibleExportNodes(child, options),
    );
  }

  if (
    options.enumerateDeliverables &&
    !options.includeTechnical &&
    node.nodeType === "output_format"
  ) {
    return [];
  }

  return [node];
}

function countTerminalFilesInExportNode(node: DeliverableNode): number {
  if (node.nodeType === "output_format") {
    return 1;
  }

  return (node.children ?? []).reduce(
    (total, child) => total + countTerminalFilesInExportNode(child),
    0,
  );
}

function buildCsvExport(paths: ExportPath[]) {
  const headers = [
    "Creative Unit",
    "Duration",
    "Aspect Ratio",
    "Platform",
    "Localization",
    "Technical Variant",
    "Output Format",
    "Suggested Filename",
  ];
  const rows = paths.map((path) => {
    const values = Object.fromEntries(
      allNodeTypes.map((type) => [
        type,
        path.nodes.find((node) => node.nodeType === type)?.label ?? "",
      ]),
    ) as Record<MatrixNodeType, string>;

    return [
      values.creative_unit,
      values.duration,
      values.aspect_ratio,
      values.platform,
      values.localization,
      values.technical_variant,
      values.output_format,
      path.filename,
    ];
  });

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function buildSheetsExport({
  mode,
  paths,
}: {
  mode: SheetsExportMode;
  paths: ExportPath[];
}) {
  const rows =
    mode === "creative"
      ? buildCreativeMatrixRows(paths)
      : buildTerminalFileRows(paths);

  return rows.map((row) => row.map(escapeSheetCell).join("\t")).join("\n");
}

function buildCreativeMatrixRows(paths: ExportPath[]) {
  const headers = [
    "Creative Unit",
    "Duration",
    "Aspect Ratio",
    "Platform",
    "Localization",
    "Technical Variants",
    "Creative Attention",
    "Output Formats",
    "Deliverable File Count",
    "Notes",
    "Assumptions / Questions",
  ];
  const groups = new Map<
    string,
    {
      outputFormats: Set<string>;
      terminalFileCount: number;
      technicalVariants: Set<string>;
      values: Record<MatrixNodeType, string>;
    }
  >();

  paths.forEach((path) => {
    const values = getPathValues(path);
    const key = [
      values.creative_unit,
      values.duration,
      values.aspect_ratio,
      values.platform,
      values.localization,
    ].join("|");
    const group =
      groups.get(key) ??
      {
        outputFormats: new Set<string>(),
        technicalVariants: new Set<string>(),
        terminalFileCount: 0,
        values,
      };

    if (values.output_format) {
      group.outputFormats.add(values.output_format);
    }

    if (values.technical_variant) {
      group.technicalVariants.add(values.technical_variant);
    }

    group.terminalFileCount += 1;
    groups.set(key, group);
  });

  const rows = Array.from(groups.values()).map((group) => [
    group.values.creative_unit,
    group.values.duration,
    group.values.aspect_ratio,
    group.values.platform,
    group.values.localization,
    Array.from(group.technicalVariants).join(", "),
    "Yes",
    Array.from(group.outputFormats).join(", "),
    String(group.terminalFileCount),
    "",
    "",
  ]);

  return [headers, ...rows];
}

function buildTerminalFileRows(paths: ExportPath[]) {
  const headers = [
    "Creative Unit",
    "Duration",
    "Aspect Ratio",
    "Platform",
    "Localization",
    "Technical Variant",
    "Output Format",
    "Expected Filename",
    "Notes",
  ];
  const rows = paths.map((path) => {
    const values = getPathValues(path);

    return [
      values.creative_unit,
      values.duration,
      values.aspect_ratio,
      values.platform,
      values.localization,
      values.technical_variant,
      values.output_format,
      path.filename,
      "",
    ];
  });

  return [headers, ...rows];
}

function getPathValues(path: ExportPath) {
  return Object.fromEntries(
    allNodeTypes.map((type) => [
      type,
      path.nodes.find((node) => node.nodeType === type)?.label ?? "",
    ]),
  ) as Record<MatrixNodeType, string>;
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeSheetCell(value: string) {
  const cleanValue = value.replace(/\r/g, "");

  if (/["\n\t]/.test(cleanValue)) {
    return `"${cleanValue.replace(/"/g, '""')}"`;
  }

  return cleanValue;
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });

  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createFolderZip(folderPaths: string[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { date, time } = getZipDateTime(new Date());

  folderPaths.forEach((folderPath) => {
    const filename = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
    const nameBytes = encoder.encode(filename);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, 0, true);
    localView.setUint32(18, 0, true);
    localView.setUint32(22, 0, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 0x0314, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, 0, true);
    centralView.setUint32(24, 0, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0x10, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );
  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, folderPaths.length, true);
  endView.setUint16(10, folderPaths.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true);

  const zipParts = [...localParts, ...centralParts, endOfCentralDirectory].map(
    toArrayBuffer,
  );

  return new Blob(zipParts, {
    type: "application/zip",
  });
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

function getZipDateTime(value: Date) {
  const year = Math.max(value.getFullYear(), 1980);

  return {
    date:
      ((year - 1980) << 9) |
      ((value.getMonth() + 1) << 5) |
      value.getDate(),
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      Math.floor(value.getSeconds() / 2),
  };
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
  const filenamePathLabels = pathLabels.filter(
    (label) => label !== technicalStandardLabel,
  );

  return formatFilenameParts(
    [clientName, projectName, ...filenamePathLabels].filter(Boolean) as string[],
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
    const existingChildren = node.children ?? [];
    const walkedChildren = existingChildren.map((child) =>
      walk(child, nextInsideSelectedBranch),
    );
    const shouldAddHere =
      inScope &&
      shouldAddVersionToParent(
        node,
        options.type,
        options.enabledForkTypes,
      );

    const nextChildren =
      shouldAddHere && options.type === "technical_variant"
        ? addTechnicalVariantBranches(walkedChildren, options)
        : shouldAddHere
          ? [
              ...walkedChildren,
              ...options.labels
                .filter(
                  (label) =>
                    !walkedChildren.some(
                      (child) =>
                        child.nodeType === options.type && child.label === label,
                    ),
                )
                .map((label) =>
                  createVersionNode(
                    options.type,
                    label,
                    options.defaultOutputFormats,
                    options.autoApplyOutputFormats,
                  ),
                ),
            ]
          : walkedChildren;

    return {
      ...node,
      children: nextChildren,
    };
  }

  return nodes.map((node) => walk(node, false));
}

function addTechnicalVariantBranches(
  children: DeliverableNode[],
  options: {
    autoApplyOutputFormats: boolean;
    defaultOutputFormats: string[];
    labels: string[];
  },
) {
  const directOutputChildren = children.filter(
    (child) => child.nodeType === "output_format",
  );
  const existingVariantChildren = children.filter(
    (child) => child.nodeType === "technical_variant",
  );
  const otherChildren = children.filter(
    (child) =>
      child.nodeType !== "output_format" && child.nodeType !== "technical_variant",
  );
  const labels = Array.from(new Set([technicalStandardLabel, ...options.labels]));
  const existingVariantLabels = new Set(
    existingVariantChildren.map((child) => child.label.toLowerCase()),
  );
  const hasStandard = existingVariantLabels.has(technicalStandardLabel.toLowerCase());
  const mergedVariantChildren = existingVariantChildren.map((child) => {
    if (
      child.label.toLowerCase() !== technicalStandardLabel.toLowerCase() ||
      !directOutputChildren.length
    ) {
      return child;
    }

    const existingOutputKeys = new Set(
      (child.children ?? [])
        .filter((output) => output.nodeType === "output_format")
        .map((output) => output.label.toLowerCase()),
    );

    return {
      ...child,
      children: [
        ...(child.children ?? []),
        ...directOutputChildren.filter(
          (output) => !existingOutputKeys.has(output.label.toLowerCase()),
        ),
      ],
    };
  });
  const standardBranch =
    hasStandard
      ? []
      : [
          createNode(
            "technical_variant",
            technicalStandardLabel,
            directOutputChildren.length
              ? directOutputChildren
              : defaultOutputChildren(options),
          ),
        ];
  const additionalBranches = labels
    .filter((label) => label !== technicalStandardLabel)
    .filter((label) => !existingVariantLabels.has(label.toLowerCase()))
    .map((label) =>
      createVersionNode(
        "technical_variant",
        label,
        options.defaultOutputFormats,
        options.autoApplyOutputFormats,
      ),
    );

  return [
    ...otherChildren,
    ...standardBranch,
    ...mergedVariantChildren,
    ...additionalBranches,
  ];
}

function shouldAddVersionToParent(
  node: DeliverableNode,
  childType: MatrixNodeType,
  enabledForkTypes: MatrixNodeType[],
) {
  if (childType !== "technical_variant") {
    return canAddVersionToParent(node.nodeType, childType, enabledForkTypes);
  }

  if (node.nodeType === "technical_variant" || node.nodeType === "output_format") {
    return false;
  }

  const children = node.children ?? [];
  const hasDirectOutput = children.some((child) => child.nodeType === "output_format");
  const hasDeeperFork = children.some((child) =>
    ["platform", "localization", "technical_variant"].includes(child.nodeType),
  );

  if (hasDirectOutput) {
    return true;
  }

  if (hasDeeperFork) {
    return false;
  }

  return canAddVersionToParent(node.nodeType, childType, enabledForkTypes);
}

function defaultOutputChildren(options: {
  autoApplyOutputFormats: boolean;
  defaultOutputFormats: string[];
}) {
  return options.autoApplyOutputFormats
    ? options.defaultOutputFormats.map((format) => createNode("output_format", format))
      : [];
}

function applyAiSuggestionDraft(
  nodes: DeliverableNode[],
  suggestion: AiSuggestion,
  draft: AiApplyDraft,
  options: {
    autoApplyOutputFormats: boolean;
    defaultOutputFormats: string[];
    enabledForkTypes: MatrixNodeType[];
  },
): {
  applied: boolean;
  message: string;
  nodes: DeliverableNode[];
  openNodeTypes: MatrixNodeType[];
  openPaths: AiSuggestion["path"][];
} {
  const plan = resolveAiApplyPlan(
    nodes,
    suggestion,
    draft,
    options.enabledForkTypes,
  );

  if (plan.blockedReason) {
    return {
      applied: false,
      message: plan.blockedReason,
      nodes,
      openNodeTypes: [],
      openPaths: [],
    };
  }

  let nextNodes = nodes;
  const openPaths: AiSuggestion["path"][] = [];

  if (draft.nodeType === "creative_unit") {
    const existingLabels = new Set(
      nodes
        .filter((node) => node.nodeType === "creative_unit")
        .map((node) => normalizeAiLabel(node.label)),
    );

    nextNodes = [
      ...nodes,
      ...plan.labels
        .filter((label) => !existingLabels.has(normalizeAiLabel(label)))
        .map((label) => createNode("creative_unit", label)),
    ];
    openPaths.push(
      ...plan.labels.map((label) => [
        { label, nodeType: "creative_unit" as const },
      ]),
    );
  } else if (draft.target === "all_creative_units") {
    nextNodes = addVersionNodes(nodes, {
      autoApplyOutputFormats: options.autoApplyOutputFormats,
      defaultOutputFormats: options.defaultOutputFormats,
      enabledForkTypes: options.enabledForkTypes,
      labels: plan.labels,
      selectedNodeId: null,
      target: "all",
      type: draft.nodeType,
    });
  } else {
    const parentMatches = findSuggestedParentNodes(nodes, suggestion, draft);

    nextNodes = parentMatches.reduce(
      (currentNodes, parent) =>
        addVersionNodes(currentNodes, {
          autoApplyOutputFormats: options.autoApplyOutputFormats,
          defaultOutputFormats: options.defaultOutputFormats,
          enabledForkTypes: options.enabledForkTypes,
          labels: plan.labels,
          selectedNodeId: parent.node.id,
          target: "selected",
          type: draft.nodeType,
        }),
      nodes,
    );
    openPaths.push(
      ...parentMatches.flatMap((parent) =>
        plan.labels.map((label) => [
          ...parent.path.map((node) => ({
            label: node.label,
            nodeType: node.nodeType,
          })),
          { label, nodeType: draft.nodeType },
        ]),
      ),
    );
  }

  if (JSON.stringify(nodes) === JSON.stringify(nextNodes)) {
    return {
      applied: false,
      message: "No matrix changes were applied. The target branches may already contain these values.",
      nodes,
      openNodeTypes: [],
      openPaths: [],
    };
  }

  return {
    applied: true,
    message: `AI suggestion applied to ${plan.changeCount} target branch${plan.changeCount === 1 ? "" : "es"}. Save when ready.`,
    nodes: nextNodes,
    openNodeTypes: [draft.nodeType],
    openPaths,
  };
}

function resolveAiApplyPlan(
  nodes: DeliverableNode[],
  suggestion: AiSuggestion,
  draft: AiApplyDraft,
  enabledForkTypes: MatrixNodeType[],
): AiApplyPlan {
  const labels = parseDraftLabels(draft.labelsText);

  if (!labels.length) {
    return {
      blockedReason: "Add at least one value before accepting this suggestion.",
      changeCount: 0,
      labels,
      previewTargets: [],
      targetCount: 0,
    };
  }

  if (draft.nodeType === "creative_unit") {
    const existingLabels = new Set(
      nodes
        .filter((node) => node.nodeType === "creative_unit")
        .map((node) => normalizeAiLabel(node.label)),
    );
    const changeCount = labels.filter(
      (label) => !existingLabels.has(normalizeAiLabel(label)),
    ).length;

    return {
      blockedReason:
        changeCount > 0
          ? null
          : "These top-level items already exist in the matrix.",
      changeCount,
      labels,
      previewTargets: ["Project root"],
      targetCount: 1,
    };
  }

  const selectedParentIds =
    draft.target === "suggested_path"
      ? findSuggestedParentNodes(nodes, suggestion, draft).map(
          (match) => match.node.id,
        )
      : null;

  if (draft.target === "suggested_path" && !selectedParentIds?.length) {
    return {
      blockedReason:
        "No matching parent branch was found for the suggested path. Add the parent branch first or switch the target.",
      changeCount: 0,
      labels,
      previewTargets: [],
      targetCount: 0,
    };
  }

  const targets = collectAiVersionTargets(
    nodes,
    draft.nodeType,
    enabledForkTypes,
    selectedParentIds,
  );
  const changeCount = targets.filter((target) =>
    targetWouldChange(target.node, draft.nodeType, labels),
  ).length;

  return {
    blockedReason:
      targets.length === 0
        ? "No matching target branches found for this version type."
        : changeCount === 0
          ? "These values already exist on all matching target branches."
          : null,
    changeCount,
    labels,
    previewTargets: targets.slice(0, 4).map((target) =>
      target.path.map((node) => node.label).join(" → "),
    ),
    targetCount: targets.length,
  };
}

function collectAiVersionTargets(
  nodes: DeliverableNode[],
  nodeType: MatrixNodeType,
  enabledForkTypes: MatrixNodeType[],
  selectedParentIds: string[] | null,
) {
  const targets: Array<{ node: DeliverableNode; path: DeliverableNode[] }> = [];
  const selectedIdSet = selectedParentIds ? new Set(selectedParentIds) : null;

  function walk(
    node: DeliverableNode,
    path: DeliverableNode[],
    insideSelectedBranch: boolean,
  ) {
    const nextPath = [...path, node];
    const nextInsideSelectedBranch =
      insideSelectedBranch || Boolean(selectedIdSet?.has(node.id));
    const inScope = selectedIdSet ? nextInsideSelectedBranch : true;

    if (
      inScope &&
      shouldAddVersionToParent(node, nodeType, enabledForkTypes)
    ) {
      targets.push({ node, path: nextPath });
    }

    node.children?.forEach((child) =>
      walk(child, nextPath, nextInsideSelectedBranch),
    );
  }

  nodes.forEach((node) => walk(node, [], false));

  return targets;
}

function targetWouldChange(
  target: DeliverableNode,
  nodeType: MatrixNodeType,
  labels: string[],
) {
  const children = target.children ?? [];
  const existingLabels = new Set(
    children
      .filter((child) => child.nodeType === nodeType)
      .map((child) => normalizeAiLabel(child.label)),
  );

  if (nodeType === "technical_variant") {
    const hasDirectOutput = children.some(
      (child) => child.nodeType === "output_format",
    );

    return labels.some((label) => {
      const normalizedLabel = normalizeAiLabel(label);

      return (
        !existingLabels.has(normalizedLabel) ||
        (normalizedLabel === normalizeAiLabel(technicalStandardLabel) &&
          hasDirectOutput)
      );
    });
  }

  return labels.some((label) => !existingLabels.has(normalizeAiLabel(label)));
}

function findSuggestedParentNodes(
  nodes: DeliverableNode[],
  suggestion: AiSuggestion,
  draft: AiApplyDraft,
) {
  const parentPath = getSuggestedParentPath(suggestion, draft.nodeType);

  if (!parentPath.length) {
    return [];
  }

  return findMatchingAiPaths(nodes, parentPath);
}

function getSuggestedParentPath(
  suggestion: AiSuggestion,
  nodeType: MatrixNodeType,
) {
  const cleanPath = suggestion.path.filter((item) => item.label.trim());
  const nodeRank = allNodeTypes.indexOf(nodeType);
  const firstChildIndex = cleanPath.findIndex((item) => {
    const itemRank = allNodeTypes.indexOf(item.nodeType);

    return itemRank >= nodeRank;
  });

  return firstChildIndex >= 0 ? cleanPath.slice(0, firstChildIndex) : cleanPath;
}

function findMatchingAiPaths(
  nodes: DeliverableNode[],
  path: AiSuggestion["path"],
) {
  const matches: Array<{ node: DeliverableNode; path: DeliverableNode[] }> = [];

  function walk(
    currentNodes: DeliverableNode[],
    depth: number,
    currentPath: DeliverableNode[],
  ) {
    const item = path[depth];

    if (!item) {
      const node = currentPath[currentPath.length - 1];

      if (node) {
        matches.push({ node, path: currentPath });
      }
      return;
    }

    currentNodes
      .filter(
        (node) =>
          node.nodeType === item.nodeType &&
          normalizeAiLabel(node.label) === normalizeAiLabel(item.label),
      )
      .forEach((node) => walk(node.children ?? [], depth + 1, [...currentPath, node]));
  }

  walk(nodes, 0, []);

  return matches;
}

function normalizeAiLabel(value: string) {
  return value.trim().toLowerCase();
}

function getInitialAiApplyDraft(suggestion: AiSuggestion): AiApplyDraft {
  const lastItem = suggestion.path[suggestion.path.length - 1];
  const nodeType = lastItem?.nodeType ?? "duration";
  const labels = suggestion.path
    .filter((item) => item.nodeType === nodeType)
    .map((item) => item.label)
    .filter(Boolean);

  return {
    labelsText: labels.length ? labels.join("\n") : lastItem?.label ?? "",
    nodeType,
    target: nodeType === "creative_unit" ? "suggested_path" : "all_creative_units",
  };
}

function parseDraftLabels(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function defaultPresetLabelsForType(type: MatrixNodeType) {
  return type === "technical_variant" ? [technicalStandardLabel] : presetValues[type];
}

function suggestionHierarchyRank(suggestion: AiSuggestion) {
  const ranks = suggestion.path.map((item) => allNodeTypes.indexOf(item.nodeType));
  const firstRank = Math.min(...ranks.filter((rank) => rank >= 0));

  return Number.isFinite(firstRank) ? firstRank : 999;
}

function collectOpenIdsForPath(
  nodes: DeliverableNode[],
  path: AiSuggestion["path"],
  openIds: Set<string>,
) {
  function walk(currentNodes: DeliverableNode[], depth: number) {
    const item = path[depth];

    if (!item) {
      return;
    }

    const match = currentNodes.find(
      (node) =>
        node.nodeType === item.nodeType &&
        node.label.toLowerCase() === item.label.trim().toLowerCase(),
    );

    if (!match) {
      return;
    }

    openIds.add(match.id);
    walk(match.children ?? [], depth + 1);
  }

  walk(nodes, 0);
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

function duplicateNodeInTree(
  nodes: DeliverableNode[],
  nodeId: string,
): { duplicatedNode: DeliverableNode; nodes: DeliverableNode[] } | null {
  let duplicatedNode: DeliverableNode | null = null;

  function walk(siblings: DeliverableNode[]): DeliverableNode[] {
    return siblings.flatMap((node) => {
      if (node.id === nodeId && node.nodeType !== "output_format") {
        const duplicate = cloneNodeForDuplicate(node, siblings);
        duplicatedNode = duplicate;
        return [node, duplicate];
      }

      return [
        {
          ...node,
          children: node.children ? walk(node.children) : node.children,
        },
      ];
    });
  }

  const nextNodes = walk(nodes);

  if (!duplicatedNode) {
    return null;
  }

  return { duplicatedNode, nodes: nextNodes };
}

function cloneNodeForDuplicate(
  node: DeliverableNode,
  siblings: DeliverableNode[],
) {
  return cloneNodeDeep(
    node,
    getDuplicateLabel(node, siblings.filter((item) => item.nodeType === node.nodeType)),
  );
}

function cloneNodeDeep(node: DeliverableNode, label = node.label): DeliverableNode {
  return createNode(
    node.nodeType,
    label,
    node.children?.map((child) => cloneNodeDeep(child)) ?? [],
  );
}

function getDuplicateLabel(node: DeliverableNode, siblings: DeliverableNode[]) {
  const siblingLabels = new Set(
    siblings.map((sibling) => sibling.label.trim().toLowerCase()),
  );
  const baseLabel = `${node.label} Copy`;
  let candidate = baseLabel;
  let suffix = 2;

  while (siblingLabels.has(candidate.trim().toLowerCase())) {
    candidate = `${baseLabel} ${suffix}`;
    suffix += 1;
  }

  return candidate;
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

function getNodeTypeLabel(nodeType: MatrixNodeType, creativeUnitLabel: string) {
  return nodeType === "creative_unit" ? creativeUnitLabel : nodeTypeLabels[nodeType];
}

function pluralizeLabel(label: string) {
  const trimmed = label.trim();

  if (!trimmed) {
    return "Creative Units";
  }

  if (trimmed.toLowerCase() === "creative unit") {
    return "Creative Units";
  }

  if (trimmed.endsWith("s")) {
    return trimmed;
  }

  return `${trimmed}s`;
}

function normalizeOutputFormatLabel(label: string) {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");

  if (normalized === "h264 mp4" || normalized === "h.264 mp4") {
    return "h.264 .mp4";
  }

  if (normalized === "prores mov" || normalized === "prores 422 mov") {
    return "ProRes .mov";
  }

  return label.trim();
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
