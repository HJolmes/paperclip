/**
 * Diagnostic probe: tries several ways of asking Graph for the tasks of the
 * default To-Do list, and prints which one works. Use to find the request
 * shape the user's tenant accepts.
 */
import { graph, graphList } from "./lib/graph.js";

type TodoList = { id: string; displayName: string; wellknownListName?: string };

async function tryIt(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    const r = (await fn()) as { value?: unknown[]; displayName?: string };
    const summary =
      Array.isArray(r?.value)
        ? `value[${r.value.length}]`
        : r?.displayName
          ? `list "${r.displayName}"`
          : "ok";
    console.log(`✅ ${label}: ${summary}`);
  } catch (err) {
    const msg = (err as Error).message.split("\n")[0];
    console.log(`❌ ${label}: ${msg}`);
  }
}

async function main(): Promise<void> {
  const lists = await graphList<TodoList>("/me/todo/lists");
  const def = lists.find((l) => l.wellknownListName === "defaultList") ?? lists[0];
  if (!def) {
    console.log("(no default list)");
    return;
  }
  const id = def.id;
  console.log(`Default list: "${def.displayName}" · id length=${id.length}`);
  console.log(`  raw  : ${id}`);
  console.log(`  trimmed: ${id.replace(/=+$/, "")}`);
  console.log("");

  // A: get the list itself by id (sanity — should work since we already use this id)
  await tryIt("A  GET /me/todo/lists/{id}", () => graph(`/me/todo/lists/${id}`));

  // B: trimmed = padding stripped
  await tryIt("B  GET /me/todo/lists/{id-trimmed}", () =>
    graph(`/me/todo/lists/${id.replace(/=+$/, "")}`),
  );

  // C: tasks via the failing endpoint, raw id
  await tryIt("C  GET /me/todo/lists/{id}/tasks?$top=3", () =>
    graph(`/me/todo/lists/${id}/tasks?$top=3`),
  );

  // D: tasks via trimmed id
  await tryIt("D  GET /me/todo/lists/{id-trimmed}/tasks?$top=3", () =>
    graph(`/me/todo/lists/${id.replace(/=+$/, "")}/tasks?$top=3`),
  );

  // E: tasks via OData function-call style with single-quoted id
  await tryIt("E  GET /me/todo/lists('{id}')/tasks?$top=3", () =>
    graph(`/me/todo/lists('${encodeURIComponent(id)}')/tasks?$top=3`),
  );

  // F: tasks with Prefer: IdType="ImmutableId" header
  await tryIt("F  …with Prefer: IdType=ImmutableId", async () => {
    const lists2 = await graph<{ value: TodoList[] }>("/me/todo/lists", {
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    const def2 = lists2.value.find((l) => l.wellknownListName === "defaultList") ?? lists2.value[0];
    return graph(`/me/todo/lists/${def2.id}/tasks?$top=3`, {
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
  });

  // G: tasks with wellknownListName as path segment
  if (def.wellknownListName) {
    await tryIt(`G  GET /me/todo/lists/${def.wellknownListName}/tasks?$top=3`, () =>
      graph(`/me/todo/lists/${def.wellknownListName}/tasks?$top=3`),
    );
  }

  // H: $expand=tasks on the list endpoint
  await tryIt("H  GET /me/todo/lists/{id}?$expand=tasks($top=3)", () =>
    graph(`/me/todo/lists/${id}?$expand=tasks($top=3)`),
  );
}

main().catch((err) => {
  console.error("probe fatal:", err);
  process.exit(1);
});
