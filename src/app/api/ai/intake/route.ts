import { NextRequest } from "next/server";
import { buildTreeOutline, type AiIntakeResult } from "@/lib/ai/intake";
import { getCurrentUser } from "@/lib/supabase/server";
import { normalizeTree } from "@/lib/tree";
import type { DeliverableTree, Project } from "@/lib/types";

const defaultModel = "gpt-4.1-mini";

type IntakePayload = {
  inputText: string;
  project: Pick<Project, "client_name" | "id" | "name">;
  tree: DeliverableTree;
};

type OpenAIResponse = {
  error?: {
    message?: string;
  };
  output?: Array<{
    content?: Array<
      | {
          text?: string;
          type: "output_text";
        }
      | {
          refusal?: string;
          type: "refusal";
        }
    >;
  }>;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as IntakePayload;
  const inputText = payload.inputText?.trim();

  if (!inputText) {
    return Response.json(
      { error: "Paste client notes or a brief before analyzing." },
      { status: 400 },
    );
  }

  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", payload.project.id)
    .single();

  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const tree = normalizeTree(payload.tree);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: [
          {
            content: buildIntakePrompt({
              inputText,
              project: payload.project,
              tree,
            }),
            role: "user",
          },
        ],
        instructions: [
          "You are an expert post-production producer analyzing motion deliverables briefs.",
          "Return only evidence-grounded suggestions. Do not invent deliverables that are not implied by the pasted text.",
          "Every suggested addition must be a concrete path using nodeType values from the schema.",
          "If a brief says something applies to all current creative units, expand it into one suggestion per creative unit.",
          "Prefer questions and assumptions over low-confidence mutations.",
        ].join(" "),
        max_output_tokens: 3000,
        model: process.env.OPENAI_MODEL || defaultModel,
        text: {
          format: {
            name: "deliverables_intake",
            schema: intakeSchema,
            strict: true,
            type: "json_schema",
          },
        },
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const body = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return Response.json(
        { error: body.error?.message ?? "AI analysis failed." },
        { status: 502 },
      );
    }

    const content = body.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text");

    if (!content || content.type !== "output_text" || !content.text) {
      return Response.json(
        { error: "AI did not return analysis text." },
        { status: 502 },
      );
    }

    return Response.json(JSON.parse(content.text) as AiIntakeResult);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI analysis failed." },
      { status: 502 },
    );
  }
}

function buildIntakePrompt({
  inputText,
  project,
  tree,
}: {
  inputText: string;
  project: Pick<Project, "client_name" | "name">;
  tree: DeliverableTree;
}) {
  return [
    `Project: ${project.client_name ? `${project.client_name} - ` : ""}${project.name}`,
    "",
    "Current deliverables tree:",
    buildTreeOutline(tree.nodes) || "(empty)",
    "",
    "Pasted client notes / brief:",
    inputText,
    "",
    "Analyze the pasted text against the current tree.",
    "Suggested additions should use this hierarchy when possible: creative_unit > duration > aspect_ratio > platform > localization > technical_variant > output_format.",
    "Do not include output_format in an addition unless the pasted text explicitly mentions a file format or codec.",
  ].join("\n");
}

const nodeTypeEnum = [
  "creative_unit",
  "duration",
  "aspect_ratio",
  "platform",
  "localization",
  "technical_variant",
  "output_format",
];

const confidenceEnum = ["high", "medium", "low"];

const noteSchema = {
  additionalProperties: false,
  properties: {
    confidence: { enum: confidenceEnum, type: "string" },
    text: { type: "string" },
  },
  required: ["confidence", "text"],
  type: "object",
};

const intakeSchema = {
  additionalProperties: false,
  properties: {
    additions: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { enum: confidenceEnum, type: "string" },
          id: { type: "string" },
          path: {
            items: {
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                nodeType: { enum: nodeTypeEnum, type: "string" },
              },
              required: ["nodeType", "label"],
              type: "object",
            },
            type: "array",
          },
          reason: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title", "confidence", "reason", "path"],
        type: "object",
      },
      type: "array",
    },
    assumptions: {
      items: noteSchema,
      type: "array",
    },
    questions: {
      items: noteSchema,
      type: "array",
    },
    removalsOrChanges: {
      items: noteSchema,
      type: "array",
    },
    summary: { type: "string" },
  },
  required: [
    "summary",
    "additions",
    "removalsOrChanges",
    "assumptions",
    "questions",
  ],
  type: "object",
};
