import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import {
  buildSheetsWorkbook,
  type SheetsExportPayload,
  type SheetsWorkbook,
} from "@/lib/google/sheets-export";
import { googleAccessTokenCookie, isGoogleConfigured } from "@/lib/google/oauth";
import { getCurrentUser } from "@/lib/supabase/server";
import { normalizeTree } from "@/lib/tree";
import type { DeliverableTree } from "@/lib/types";

const creativeSheetId = 1001;
const terminalSheetId = 1002;
const summarySheetId = 1003;

type GoogleSpreadsheet = {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
};

export async function POST(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return Response.json(
      { error: "Google export is not configured." },
      { status: 503 },
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(googleAccessTokenCookie)?.value;

  if (!accessToken) {
    return Response.json({ needsAuth: true }, { status: 401 });
  }

  const payload = (await request.json()) as SheetsExportPayload;
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

  try {
    const workbook = buildSheetsWorkbook({
      ...payload,
      tree: normalizeTree(payload.tree) as DeliverableTree,
    });
    const spreadsheet = await createSpreadsheet(accessToken, workbook);

    if (!spreadsheet.spreadsheetId || !spreadsheet.spreadsheetUrl) {
      return Response.json(
        { error: "Google did not return a spreadsheet URL." },
        { status: 502 },
      );
    }

    await writeValues(accessToken, spreadsheet.spreadsheetId, workbook);
    await formatSpreadsheet(accessToken, spreadsheet.spreadsheetId, workbook);

    return Response.json({
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Sheets request failed.",
      },
      { status: 502 },
    );
  }
}

async function createSpreadsheet(
  accessToken: string,
  workbook: SheetsWorkbook,
) {
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    body: JSON.stringify({
      properties: {
        title: workbook.title,
      },
      sheets: [
        {
          properties: {
            gridProperties: {
              columnCount: workbook.creativeRows[0]?.length ?? 11,
              frozenRowCount: 1,
              rowCount: Math.max(workbook.creativeRows.length + 20, 100),
            },
            sheetId: creativeSheetId,
            title: "Creative Matrix",
          },
        },
        {
          properties: {
            gridProperties: {
              columnCount: workbook.terminalRows[0]?.length ?? 9,
              frozenRowCount: 1,
              rowCount: Math.max(workbook.terminalRows.length + 20, 100),
            },
            sheetId: terminalSheetId,
            title: "Deliverable Files",
          },
        },
        {
          properties: {
            gridProperties: {
              columnCount: 2,
              frozenRowCount: 1,
              rowCount: 20,
            },
            sheetId: summarySheetId,
            title: "Summary",
          },
        },
      ],
    }),
    headers: googleHeaders(accessToken),
    method: "POST",
  });

  return parseGoogleResponse<GoogleSpreadsheet>(response);
}

async function writeValues(
  accessToken: string,
  spreadsheetId: string,
  workbook: SheetsWorkbook,
) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      body: JSON.stringify({
        data: [
          {
            range: "Creative Matrix!A1",
            values: workbook.creativeRows,
          },
          {
            range: "Deliverable Files!A1",
            values: workbook.terminalRows,
          },
          {
            range: "Summary!A1",
            values: workbook.summaryRows,
          },
        ],
        valueInputOption: "USER_ENTERED",
      }),
      headers: googleHeaders(accessToken),
      method: "POST",
    },
  );

  await parseGoogleResponse(response);
}

async function formatSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  workbook: SheetsWorkbook,
) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      body: JSON.stringify({
        requests: [
          ...formatSheetRequests({
            columnCount: workbook.creativeRows[0]?.length ?? 11,
            durationColumn: 1,
            durationValues: workbook.durations,
            rowCount: workbook.creativeRows.length,
            sheetId: creativeSheetId,
          }),
          ...formatSheetRequests({
            columnCount: workbook.terminalRows[0]?.length ?? 9,
            durationColumn: 1,
            durationValues: workbook.durations,
            rowCount: workbook.terminalRows.length,
            sheetId: terminalSheetId,
          }),
          ...formatSheetRequests({
            columnCount: 2,
            durationValues: [],
            rowCount: workbook.summaryRows.length,
            sheetId: summarySheetId,
          }),
          ...dataValidationRequests(workbook),
        ],
      }),
      headers: googleHeaders(accessToken),
      method: "POST",
    },
  );

  await parseGoogleResponse(response);
}

function formatSheetRequests({
  columnCount,
  durationColumn,
  durationValues,
  rowCount,
  sheetId,
}: {
  columnCount: number;
  durationColumn?: number;
  durationValues: string[];
  rowCount: number;
  sheetId: number;
}) {
  return [
    {
      repeatCell: {
        cell: {
          userEnteredFormat: {
            backgroundColor: { blue: 0.12, green: 0.1, red: 0.08 },
            horizontalAlignment: "CENTER",
            textFormat: {
              bold: true,
              foregroundColor: { blue: 1, green: 1, red: 1 },
            },
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        range: {
          endColumnIndex: columnCount,
          endRowIndex: 1,
          sheetId,
          startColumnIndex: 0,
          startRowIndex: 0,
        },
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            endColumnIndex: columnCount,
            endRowIndex: Math.max(rowCount, 2),
            sheetId,
            startColumnIndex: 0,
            startRowIndex: 0,
          },
        },
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          dimension: "COLUMNS",
          endIndex: columnCount,
          sheetId,
          startIndex: 0,
        },
      },
    },
    ...(durationColumn === undefined
      ? []
      : durationValues.map((duration) => ({
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [
                {
                  endColumnIndex: durationColumn + 1,
                  endRowIndex: Math.max(rowCount, 2),
                  sheetId,
                  startColumnIndex: durationColumn,
                  startRowIndex: 1,
                },
              ],
              booleanRule: {
                condition: {
                  type: "TEXT_EQ",
                  values: [{ userEnteredValue: duration }],
                },
                format: {
                  backgroundColor: colorForDuration(duration),
                },
              },
            },
          },
        }))),
  ];
}

function dataValidationRequests(workbook: SheetsWorkbook) {
  return [
    oneOfListValidation({
      columnIndex: 1,
      rowCount: workbook.creativeRows.length,
      sheetId: creativeSheetId,
      values: workbook.durations,
    }),
    oneOfListValidation({
      columnIndex: 2,
      rowCount: workbook.creativeRows.length,
      sheetId: creativeSheetId,
      values: workbook.aspectRatios,
    }),
    checkboxValidation({
      columnIndex: 6,
      rowCount: workbook.creativeRows.length,
      sheetId: creativeSheetId,
    }),
    oneOfListValidation({
      columnIndex: 1,
      rowCount: workbook.terminalRows.length,
      sheetId: terminalSheetId,
      values: workbook.durations,
    }),
    oneOfListValidation({
      columnIndex: 2,
      rowCount: workbook.terminalRows.length,
      sheetId: terminalSheetId,
      values: workbook.aspectRatios,
    }),
    oneOfListValidation({
      columnIndex: 5,
      rowCount: workbook.terminalRows.length,
      sheetId: terminalSheetId,
      values: workbook.technicalVariants,
    }),
    oneOfListValidation({
      columnIndex: 6,
      rowCount: workbook.terminalRows.length,
      sheetId: terminalSheetId,
      values: workbook.outputFormats,
    }),
  ].filter(Boolean);
}

function oneOfListValidation({
  columnIndex,
  rowCount,
  sheetId,
  values,
}: {
  columnIndex: number;
  rowCount: number;
  sheetId: number;
  values: string[];
}) {
  if (!values.length || rowCount <= 1) {
    return null;
  }

  return {
    setDataValidation: {
      range: {
        endColumnIndex: columnIndex + 1,
        endRowIndex: rowCount,
        sheetId,
        startColumnIndex: columnIndex,
        startRowIndex: 1,
      },
      rule: {
        condition: {
          type: "ONE_OF_LIST",
          values: values.map((value) => ({ userEnteredValue: value })),
        },
        showCustomUi: true,
        strict: false,
      },
    },
  };
}

function checkboxValidation({
  columnIndex,
  rowCount,
  sheetId,
}: {
  columnIndex: number;
  rowCount: number;
  sheetId: number;
}) {
  if (rowCount <= 1) {
    return null;
  }

  return {
    setDataValidation: {
      range: {
        endColumnIndex: columnIndex + 1,
        endRowIndex: rowCount,
        sheetId,
        startColumnIndex: columnIndex,
        startRowIndex: 1,
      },
      rule: {
        condition: {
          type: "BOOLEAN",
        },
        strict: false,
      },
    },
  };
}

function colorForDuration(duration: string) {
  if (duration.includes("06") || duration.includes("6")) {
    return { blue: 0.78, green: 0.78, red: 0.98 };
  }

  if (duration.includes("15")) {
    return { blue: 0.55, green: 0.85, red: 0.98 };
  }

  if (duration.includes("30")) {
    return { blue: 0.78, green: 0.92, red: 0.78 };
  }

  if (duration.includes("60")) {
    return { blue: 0.88, green: 0.82, red: 0.75 };
  }

  return { blue: 0.92, green: 0.9, red: 0.88 };
}

function googleHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function parseGoogleResponse<T = unknown>(response: Response) {
  const body = (await response.json()) as T & {
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(body.error?.message ?? "Google Sheets request failed.");
  }

  return body;
}
