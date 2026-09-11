// Source-wide available-field hierarchy for the Anzeige (Visible fields) panel.
// Branches follow record/table paths; leaves are top-level field names per path.
// Selection stays name-based: identical names across branches share one checkbox
// state, and switching flat/tree views never changes the selected names.
export interface FieldStructureEntry {
  path: string[];
  fields: string[];
}

export interface FieldTreeNode {
  /** Display segment for this branch (empty for the root container). */
  segment: string;
  /** Full record path from the source root to this branch. */
  path: string[];
  /** Stable key for expansion state. */
  key: string;
  /** Field names attached directly to this record path. */
  fields: string[];
  children: FieldTreeNode[];
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sortedUnique(names: string[]): string[] {
  return [...new Set(names)].sort(compareNames);
}

/** Group flat per-path field lists into a nested branch tree. */
export function buildFieldTree(entries: FieldStructureEntry[]): FieldTreeNode[] {
  const root: FieldTreeNode = { segment: "", path: [], key: "", fields: [], children: [] };
  const byKey = new Map<string, FieldTreeNode>([["", root]]);
  const ordered = [...entries].sort((a, b) => {
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    const keyA = JSON.stringify(a.path);
    const keyB = JSON.stringify(b.path);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  for (const entry of ordered) {
    let parent = root;
    let prefix: string[] = [];
    for (const segment of entry.path) {
      prefix = [...prefix, segment];
      const key = JSON.stringify(prefix);
      let node = byKey.get(key);
      if (!node) {
        node = { segment, path: prefix, key, fields: [], children: [] };
        byKey.set(key, node);
        parent.children.push(node);
      }
      parent = node;
    }
    parent.fields = sortedUnique([...parent.fields, ...entry.fields]);
  }
  const sortTree = (node: FieldTreeNode): void => {
    node.children.sort((a, b) => compareNames(a.segment, b.segment));
    for (const child of node.children) sortTree(child);
  };
  sortTree(root);
  // Flat sources (single empty path) surface as root-level fields.
  if (root.children.length === 0) {
    root.fields = sortedUnique(root.fields);
    return root.fields.length ? [root] : [];
  }
  return root.children;
}

/** Derive the same entry shape from legacy in-memory Jazz tables. */
export function entriesForTables(
  tables: { path: string[]; rows: Record<string, unknown>[] }[],
): FieldStructureEntry[] {
  const fieldsByPath = new Map<string, { path: string[]; fields: Set<string> }>();
  for (const table of tables) {
    const key = JSON.stringify(table.path);
    let entry = fieldsByPath.get(key);
    if (!entry) {
      entry = { path: [...table.path], fields: new Set<string>() };
      fieldsByPath.set(key, entry);
    }
    for (const row of table.rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      for (const name of Object.keys(row)) entry.fields.add(name);
    }
  }
  return [...fieldsByPath.values()].map((entry) => ({
    path: entry.path,
    fields: sortedUnique([...entry.fields]),
  }));
}
