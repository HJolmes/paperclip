import { graph, graphList, pathId } from "./lib/graph.js";

type TodoList = { id: string; displayName: string; wellknownListName?: string };
type Task = { id: string; title: string; status: string; importance?: string };

async function main(): Promise<void> {
  const lists = await graphList<TodoList>("/me/todo/lists");
  console.log("Listen:");
  for (const l of lists) {
    console.log(`  - ${l.displayName} (${l.wellknownListName ?? "custom"}) · ${l.id}`);
  }
  const def = lists.find((l) => l.wellknownListName === "defaultList") ?? lists[0];
  if (!def) {
    console.log("(keine Liste gefunden)");
    return;
  }
  const tasks = await graph<{ value: Task[] }>(
    `/me/todo/lists/${pathId(def.id)}/tasks?$top=5&$select=id,title,status,importance`,
  );
  console.log(`\nErste 5 Tasks aus "${def.displayName}":`);
  for (const t of tasks.value) {
    console.log(`  - ${t.status.padEnd(12)} ${t.title}`);
  }
}

main().catch((err) => {
  console.error("connection-test failed:", err);
  process.exit(1);
});
