import type { IssueStatus } from "./paperclip.js";

export type TodoStatus =
  | "notStarted"
  | "inProgress"
  | "completed"
  | "waitingOnOthers"
  | "deferred";

export type TodoImportance = "low" | "normal" | "high";

export const todoToIssueStatus = (s: TodoStatus): IssueStatus => {
  switch (s) {
    case "notStarted":
      return "todo";
    case "inProgress":
      return "in_progress";
    case "completed":
      return "done";
    case "waitingOnOthers":
    case "deferred":
      return "blocked";
  }
};

export const issueToTodoStatus = (s: IssueStatus): TodoStatus | null => {
  switch (s) {
    case "todo":
    case "backlog":
      return "notStarted";
    case "in_progress":
    case "in_review":
      return "inProgress";
    case "done":
      return "completed";
    case "blocked":
      return "waitingOnOthers";
    case "cancelled":
      return null;
  }
};

export const importanceToPriority = (
  i?: TodoImportance,
): "critical" | "high" | "medium" | "low" => {
  if (i === "high") return "high";
  if (i === "low") return "low";
  return "medium";
};
