import { calculateCounts } from "@/lib/tree";
import type {
  DeliverableNode,
  DeliverableTree,
  FilenameCase,
  FilenameSeparator,
  MatrixNodeType,
  Project,
} from "@/lib/types";

type ExportPath = {
  filename: string;
  nodes: DeliverableNode[];
};

export type SheetsExportPayload = {
  filenameCase: FilenameCase;
  filenameSeparator: FilenameSeparator;
  project: Pick<Project, "client_name" | "id" | "name">;
  tree: DeliverableTree;
};

export type SheetsWorkbook = {
  aspectRatios: string[];
  creativeRows: Array<Array<string | number | boolean>>;
  durations: string[];
  outputFormats: string[];
  summaryRows: Array<Array<string | number>>;
  technicalVariants: string[];
  terminalRows: Array<Array<string | number | boolean>>;
  title: string;
};

const allNodeTypes: MatrixNodeType[] = [
  "creative_unit",
  "duration",
  "aspect_ratio",
  "platform",
  "localization",
  "technical_variant",
  "output_format",
];

export function buildSheetsWorkbook({
  filenameCase,
  filenameSeparator,
  project,
  tree,
}: SheetsExportPayload): SheetsWorkbook {
  const paths = collectExportPaths(tree, project, {
    caseStyle: filenameCase,
    separator: filenameSeparator,
  });
  const counts = calculateCounts(tree);
  const creativeRows = buildCreativeMatrixRows(paths);
  const terminalRows = buildTerminalFileRows(paths);
  const title = formatFilenameParts(
    [project.client_name, project.name, "deliverables"].filter(Boolean) as string[],
    { caseStyle: "title", separator: " " },
  );

  return {
    aspectRatios: uniquePathValues(paths, "aspect_ratio"),
    creativeRows,
    durations: uniquePathValues(paths, "duration"),
    outputFormats: uniquePathValues(paths, "output_format"),
    summaryRows: [
      ["Metric", "Count"],
      ["Creative deliverables", counts.creativeDeliverables],
      ["Deliverable files", counts.terminalFiles],
      ["Creative matrix rows", Math.max(creativeRows.length - 1, 0)],
      ["Deliverable file rows", Math.max(terminalRows.length - 1, 0)],
    ],
    technicalVariants: uniquePathValues(paths, "technical_variant"),
    terminalRows,
    title,
  };
}

function collectExportPaths(
  tree: DeliverableTree,
  project: Pick<Project, "client_name" | "name">,
  options: {
    caseStyle: FilenameCase;
    separator: FilenameSeparator;
  },
) {
  const paths: ExportPath[] = [];

  function walk(node: DeliverableNode, path: DeliverableNode[]) {
    const nextPath = [...path, node];

    if (!node.children?.length) {
      if (node.nodeType === "output_format") {
        paths.push({
          filename: suggestFilename({
            caseStyle: options.caseStyle,
            clientName: project.client_name,
            pathLabels: nextPath.map((item) => item.label),
            projectName: project.name,
            separator: options.separator,
          }),
          nodes: nextPath,
        });
      }
      return;
    }

    node.children.forEach((child) => walk(child, nextPath));
  }

  tree.nodes.forEach((node) => walk(node, []));

  return paths.sort((first, second) => first.filename.localeCompare(second.filename));
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
    true,
    Array.from(group.outputFormats).join(", "),
    group.terminalFileCount,
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

function uniquePathValues(paths: ExportPath[], nodeType: MatrixNodeType) {
  const values = new Set<string>();

  paths.forEach((path) => {
    const value = path.nodes.find((node) => node.nodeType === nodeType)?.label;

    if (value) {
      values.add(value);
    }
  });

  return Array.from(values).sort((first, second) => first.localeCompare(second));
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
    separator: FilenameSeparator | " ";
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
