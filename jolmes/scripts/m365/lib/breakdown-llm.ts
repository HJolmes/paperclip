import { spawn } from "node:child_process";

export type BreakdownDecision =
  | { breakdown: false; reason?: string }
  | {
      breakdown: true;
      subtasks: Array<{
        title: string;
        priority: "critical" | "high" | "medium" | "low";
      }>;
      reason?: string;
    };

const SYSTEM_PROMPT = `Du analysierst To-Do-Aufgaben und entscheidest, ob es
sinnvoll ist, sie in Subtasks zu zerlegen.

Regeln:
- Nur zerlegen, wenn die Aufgabe mehrere klar voneinander getrennte
  Arbeitsschritte enthält (z. B. "Vertrag verlängern" → Unterlagen
  sichten, Konditionen verhandeln, Vertrag unterschreiben).
- NICHT zerlegen bei: trivialen Einzelaktionen ("Müll rausbringen",
  "Mail beantworten"), reinen Erinnerungen, Aufgaben die schon klein
  und atomar sind, oder wenn der Titel zu vage ist um sinnvoll zu
  zerlegen.
- Maximal 7 Subtasks. Lieber weniger und prägnant.
- Subtask-Titel: kurze deutsche Imperativ-Formulierung, max ~60 Zeichen.
- Reihenfolge = vorgeschlagene Bearbeitungs-Reihenfolge.
- Prioritäten: erste 1-2 typisch "high", Mitte "medium", reine
  Nachbereitung "low". "critical" nur bei harten Deadlines/Risiken.

Antworte ausschließlich mit gültigem JSON nach diesem Schema:
{ "breakdown": false, "reason": "..." }
ODER
{ "breakdown": true, "reason": "...", "subtasks": [
    { "title": "...", "priority": "high" }, ...
  ]
}

Kein Fließtext, kein Markdown, nur das JSON.`;

function buildPrompt(input: {
  title: string;
  description?: string;
  priority?: string;
}): string {
  const lines = [
    SYSTEM_PROMPT,
    "",
    "## Aufgabe",
    `Titel: ${input.title}`,
  ];
  if (input.priority) lines.push(`Priorität: ${input.priority}`);
  if (input.description && input.description.trim()) {
    lines.push("", "Beschreibung:", input.description.trim());
  }
  return lines.join("\n");
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fence) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

async function runClaude(prompt: string): Promise<string> {
  const cmd = process.env.CLAUDE_CLI_BIN || "claude";
  // -p / --print: non-interactive one-shot. Model defaults to whatever
  // the user's CLI is configured for; we don't override so a sonnet-4-6
  // installation stays sonnet-4-6.
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, ["-p", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude CLI exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

export async function decideBreakdown(input: {
  title: string;
  description?: string;
  priority?: string;
}): Promise<BreakdownDecision> {
  const prompt = buildPrompt(input);
  const raw = await runClaude(prompt);
  const json = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `LLM returned non-JSON for "${input.title}": ${(err as Error).message}; raw=${raw.slice(0, 200)}`,
    );
  }
  return normalizeDecision(parsed, input.title);
}

function normalizeDecision(value: unknown, title: string): BreakdownDecision {
  if (typeof value !== "object" || value === null) {
    throw new Error(`LLM decision for "${title}" is not an object`);
  }
  const v = value as Record<string, unknown>;
  if (v.breakdown !== true) {
    return {
      breakdown: false,
      reason: typeof v.reason === "string" ? v.reason : undefined,
    };
  }
  if (!Array.isArray(v.subtasks)) {
    return { breakdown: false, reason: "subtasks missing or invalid" };
  }
  const subtasks = v.subtasks
    .map((s) => {
      if (typeof s !== "object" || s === null) return null;
      const obj = s as Record<string, unknown>;
      const t = typeof obj.title === "string" ? obj.title.trim() : "";
      if (!t) return null;
      const p = typeof obj.priority === "string" ? obj.priority : "medium";
      const priority: "critical" | "high" | "medium" | "low" =
        p === "critical" || p === "high" || p === "low" ? p : "medium";
      return { title: t.slice(0, 200), priority };
    })
    .filter((x): x is { title: string; priority: "critical" | "high" | "medium" | "low" } => x !== null)
    .slice(0, 7);
  if (subtasks.length === 0) {
    return { breakdown: false, reason: "no usable subtasks returned" };
  }
  return {
    breakdown: true,
    subtasks,
    reason: typeof v.reason === "string" ? v.reason : undefined,
  };
}
