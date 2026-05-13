import { graph, graphList, pathId } from "./graph.js";

export type ChecklistItem = {
  id: string;
  displayName: string;
  isChecked: boolean;
  checkedDateTime?: string | null;
  createdDateTime?: string;
};

const base = (listId: string, taskId: string): string =>
  `/me/todo/lists/${pathId(listId)}/tasks/${pathId(taskId)}/checklistItems`;

export async function listChecklistItems(
  listId: string,
  taskId: string,
): Promise<ChecklistItem[]> {
  return graphList<ChecklistItem>(base(listId, taskId));
}

export async function createChecklistItem(
  listId: string,
  taskId: string,
  displayName: string,
): Promise<ChecklistItem> {
  return graph<ChecklistItem>(base(listId, taskId), {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export async function patchChecklistItem(
  listId: string,
  taskId: string,
  itemId: string,
  patch: Partial<Pick<ChecklistItem, "displayName" | "isChecked">>,
): Promise<ChecklistItem> {
  return graph<ChecklistItem>(`${base(listId, taskId)}/${pathId(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
