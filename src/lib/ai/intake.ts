import type { DeliverableNode, MatrixNodeType } from "@/lib/types";

export type AiConfidence = "high" | "medium" | "low";

export type AiPathItem = {
  label: string;
  nodeType: MatrixNodeType;
};

export type AiSuggestion = {
  confirmationLanguage: string;
  confidence: AiConfidence;
  id: string;
  path: AiPathItem[];
  reason: string;
  sourceExcerpt: string;
  title: string;
};

export type AiNote = {
  confidence: AiConfidence;
  text: string;
};

export type AiIntakeResult = {
  additions: AiSuggestion[];
  assumptions: AiNote[];
  removalsOrChanges: AiNote[];
  questions: AiNote[];
  summary: string;
};

export function buildTreeOutline(nodes: DeliverableNode[]) {
  const lines: string[] = [];

  function walk(node: DeliverableNode, depth: number) {
    lines.push(`${"  ".repeat(depth)}- ${node.nodeType}: ${node.label}`);
    node.children?.forEach((child) => walk(child, depth + 1));
  }

  nodes.forEach((node) => walk(node, 0));

  return lines.join("\n");
}
