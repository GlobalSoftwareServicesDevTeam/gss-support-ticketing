import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

function normalizePriority(val: string): string {
  const upper = val.toUpperCase().trim();
  if (VALID_PRIORITIES.includes(upper)) return upper;
  // Common aliases
  if (upper === "NORMAL" || upper === "MED") return "MEDIUM";
  if (upper === "URGENT") return "CRITICAL";
  return "MEDIUM";
}

function normalizeStatus(val: string): string {
  const upper = val.toUpperCase().trim().replace(/[\s-]+/g, "_");
  if (VALID_STATUSES.includes(upper)) return upper;
  // Common aliases
  if (upper === "DONE" || upper === "COMPLETE" || upper === "COMPLETED") return "DONE";
  if (upper === "IN_PROGRESS" || upper === "STARTED" || upper === "WIP") return "IN_PROGRESS";
  if (upper === "REVIEW" || upper === "IN_REVIEW") return "IN_REVIEW";
  return "TODO";
}

function parseDate(val: string): Date | null {
  if (!val || !val.trim()) return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}

interface ImportRow {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  assignee?: string;
}

// Column name mapping: support common column header variations
function mapRow(raw: Record<string, string>): ImportRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== "") return String(raw[k]);
    }
    return "";
  };
  return {
    title: get("title", "task", "taskname", "name", "tasktitle", "subject"),
    description: get("description", "notes", "details", "desc", "note", "comment"),
    priority: get("priority", "prio", "importance", "urgency"),
    status: get("status", "state", "taskstatus"),
    startDate: get("startdate", "start", "datestarted", "from"),
    dueDate: get("duedate", "due", "enddate", "end", "deadline", "dateDue", "date"),
    assignee: get("assignee", "owner", "assignedto", "assigned", "user", "assigneduser"),
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;
  const columnMapping = formData.get("columnMapping") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "Project is required" }, { status: 400 });
  }

  // Verify project exists
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Parse custom column mapping if provided
  let customMapping: Record<string, string> | null = null;
  if (columnMapping) {
    try {
      customMapping = JSON.parse(columnMapping);
    } catch {
      // ignore invalid mapping
    }
  }

  // Parse file based on type
  let rawRows: Record<string, string>[];
  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
      const text = await file.text();
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, ""),
      });
      rawRows = result.data;
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: "" });
      rawRows = rows.map((row) => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          normalized[key.trim().toLowerCase().replace(/[\s-]+/g, "")] = String(value);
        }
        return normalized;
      });
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use .csv, .tsv, .xlsx, or .xls" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse file: ${e instanceof Error ? e.message : "Unknown error"}` }, { status: 400 });
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "No data rows found in file" }, { status: 400 });
  }

  // Apply custom mapping if provided, otherwise auto-map
  const mappedRows: ImportRow[] = rawRows.map((raw) => {
    if (customMapping) {
      const remapped: Record<string, string> = {};
      for (const [targetField, sourceColumn] of Object.entries(customMapping)) {
        if (sourceColumn && raw[sourceColumn] !== undefined) {
          remapped[targetField] = raw[sourceColumn];
        }
      }
      return remapped as unknown as ImportRow;
    }
    return mapRow(raw);
  });

  // Load users for assignee matching
  const users = await prisma.user.findMany({
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  // Get current max order
  const maxOrder = await prisma.task.aggregate({
    where: { projectId },
    _max: { order: true },
  });
  let nextOrder = (maxOrder._max.order || 0) + 1;

  const created: string[] = [];
  const errors: { row: number; title: string; error: string }[] = [];

  for (let i = 0; i < mappedRows.length; i++) {
    const row = mappedRows[i];
    const title = row.title?.trim();

    if (!title) {
      errors.push({ row: i + 2, title: "(empty)", error: "Missing title" });
      continue;
    }

    // Match assignee by name or email
    let assigneeId: string | null = null;
    if (row.assignee) {
      const search = row.assignee.trim().toLowerCase();
      const matched = users.find(
        (u) =>
          u.email.toLowerCase() === search ||
          `${u.firstName} ${u.lastName}`.toLowerCase() === search ||
          u.firstName.toLowerCase() === search ||
          u.lastName.toLowerCase() === search
      );
      if (matched) assigneeId = matched.id;
    }

    try {
      const task = await prisma.task.create({
        data: {
          title,
          description: row.description?.trim() || null,
          priority: row.priority ? normalizePriority(row.priority) : "MEDIUM",
          status: row.status ? normalizeStatus(row.status) : "TODO",
          startDate: row.startDate ? parseDate(row.startDate) : null,
          dueDate: row.dueDate ? parseDate(row.dueDate) : null,
          order: nextOrder++,
          projectId,
          assignments: assigneeId
            ? { create: [{ userId: assigneeId }] }
            : undefined,
        },
      });
      created.push(task.id);
    } catch (e) {
      errors.push({
        row: i + 2,
        title,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    imported: created.length,
    errors: errors.length,
    details: errors.length > 0 ? errors.slice(0, 20) : undefined,
    total: mappedRows.length,
  });
}

// Preview endpoint — parse and return headers + first rows for column mapping
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  let headers: string[] = [];
  let preview: Record<string, string>[] = [];

  try {
    if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
      const text = await file.text();
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        preview: 5,
      });
      headers = result.meta.fields || [];
      preview = result.data;
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: "" });
      if (rows.length > 0) {
        headers = Object.keys(rows[0]);
        preview = rows.slice(0, 5);
      }
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse file: ${e instanceof Error ? e.message : "Unknown error"}` }, { status: 400 });
  }

  // Auto-detect column mappings
  const autoMapping: Record<string, string> = {};
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, ""));
  const fieldAliases: Record<string, string[]> = {
    title: ["title", "task", "taskname", "name", "tasktitle", "subject"],
    description: ["description", "notes", "details", "desc", "note", "comment"],
    priority: ["priority", "prio", "importance", "urgency"],
    status: ["status", "state", "taskstatus"],
    startDate: ["startdate", "start", "datestarted", "from"],
    dueDate: ["duedate", "due", "enddate", "end", "deadline", "datedue", "date"],
    assignee: ["assignee", "owner", "assignedto", "assigned", "user", "assigneduser"],
  };

  for (const [field, aliases] of Object.entries(fieldAliases)) {
    const idx = normalizedHeaders.findIndex((h) => aliases.includes(h));
    if (idx !== -1) {
      autoMapping[field] = normalizedHeaders[idx];
    }
  }

  return NextResponse.json({
    headers,
    preview,
    autoMapping,
    totalRows: preview.length,
  });
}
