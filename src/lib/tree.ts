import type {
  DeliverableNode,
  DeliverableTree,
  MatrixCounts,
  MatrixNodeType,
} from "@/lib/types";

export const defaultHierarchy: MatrixNodeType[] = [
  "creative_unit",
  "duration",
  "aspect_ratio",
  "output_format",
];

export const optionalLevels: MatrixNodeType[] = [
  "platform",
  "technical_variant",
];

export const nodeTypeLabels: Record<MatrixNodeType, string> = {
  creative_unit: "Creative Unit",
  duration: "Duration / Cut",
  aspect_ratio: "Aspect Ratio / Placement",
  platform: "Platform",
  technical_variant: "Technical Variant",
  output_format: "Output Format",
};

export const childOptions: Record<MatrixNodeType, MatrixNodeType[]> = {
  creative_unit: ["duration"],
  duration: ["aspect_ratio"],
  aspect_ratio: ["output_format", "platform", "technical_variant"],
  platform: ["technical_variant", "output_format"],
  technical_variant: ["output_format"],
  output_format: [],
};

export const presetValues: Record<MatrixNodeType, string[]> = {
  creative_unit: ["Creative Unit 01", "Creative Unit 02", "Hero Film"],
  duration: [":60", ":30", ":15", ":06"],
  aspect_ratio: ["16x9", "9x16", "1x1", "4x5"],
  platform: ["Instagram", "TikTok", "YouTube", "Meta"],
  technical_variant: ["With Slate", "Without Slate", "Broadcast", "Web"],
  output_format: ["H264 MP4", "ProRes MOV"],
};

export function createId(prefix = "node") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createNode(
  nodeType: MatrixNodeType,
  label: string,
  children: DeliverableNode[] = [],
): DeliverableNode {
  return {
    id: createId(nodeType),
    nodeType,
    label,
    children,
  };
}

export function createDefaultTree(): DeliverableTree {
  return {
    version: 1,
    hierarchy: defaultHierarchy,
    optionalLevels,
    defaultOutputFormats: ["H264 MP4", "ProRes MOV"],
    autoApplyOutputFormats: true,
    nodes: [
      createNode("creative_unit", "Creative Unit 01", [
        createNode("duration", ":30", [
          createNode("aspect_ratio", "16x9", [
            createNode("output_format", "H264 MP4"),
            createNode("output_format", "ProRes MOV"),
          ]),
        ]),
      ]),
    ],
  };
}

export function calculateCounts(tree: DeliverableTree): MatrixCounts {
  const terminalPaths: DeliverableNode[][] = [];

  function walk(node: DeliverableNode, path: DeliverableNode[]) {
    const nextPath = [...path, node];

    if (!node.children?.length) {
      terminalPaths.push(nextPath);
      return;
    }

    node.children.forEach((child) => walk(child, nextPath));
  }

  tree.nodes.forEach((node) => walk(node, []));

  const creativeKeys = new Set<string>();
  let terminalFiles = 0;

  terminalPaths.forEach((path) => {
    const hasOutput = path.some((node) => node.nodeType === "output_format");
    const creativePath = path.filter(
      (node) =>
        node.nodeType !== "output_format" &&
        node.nodeType !== "technical_variant",
    );

    if (
      creativePath.some((node) => node.nodeType === "creative_unit") &&
      creativePath.some((node) => node.nodeType === "duration") &&
      creativePath.some((node) => node.nodeType === "aspect_ratio")
    ) {
      creativeKeys.add(
        creativePath.map((node) => `${node.nodeType}:${node.label}`).join("|"),
      );
    }

    terminalFiles += hasOutput ? 1 : 0;
  });

  return {
    creativeDeliverables: creativeKeys.size,
    terminalFiles,
  };
}

export function countNodesByType(
  tree: DeliverableTree,
  nodeType: MatrixNodeType,
) {
  const labels = new Set<string>();

  function walk(node: DeliverableNode) {
    if (node.nodeType === nodeType) {
      labels.add(node.label);
    }

    node.children?.forEach(walk);
  }

  tree.nodes.forEach(walk);

  return labels.size;
}

export function countTerminalsForNode(node: DeliverableNode) {
  let total = 0;

  function walk(current: DeliverableNode) {
    if (!current.children?.length) {
      if (current.nodeType === "output_format") {
        total += 1;
      }
      return;
    }

    current.children.forEach(walk);
  }

  walk(node);

  return total;
}

export function normalizeTree(value: unknown): DeliverableTree {
  if (isDeliverableTree(value)) {
    return value;
  }

  return createDefaultTree();
}

function isDeliverableTree(value: unknown): value is DeliverableTree {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DeliverableTree;
  return candidate.version === 1 && Array.isArray(candidate.nodes);
}
