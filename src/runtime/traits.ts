import { read } from "./read";

/** A dnd5e trait choice tree (dnd5e.documents.Trait.choices): keys map to entries that may have children. */
export type TraitTree = Readonly<Record<string, unknown>>;

function childrenOf(node: unknown): TraitTree | null {
  const children = read(node, "children");
  return (children && (typeof children === "object")) ? children as TraitTree : null;
}

/** Keys from the root down to `key`, e.g. ["exotic", "primordial", "ignan"]; [] when absent. */
export function traitPath(tree: TraitTree | null | undefined, key: string): string[] {
  if (!tree) return [];
  for (const [nodeKey, node] of Object.entries(tree)) {
    if (nodeKey === key) return [nodeKey];
    const below = traitPath(childrenOf(node), key);
    if (below.length) return [nodeKey, ...below];
  }
  return [];
}

function allKeys(tree: TraitTree | null): string[] {
  if (!tree) return [];
  return Object.entries(tree).flatMap(([key, node]) => [key, ...allKeys(childrenOf(node))]);
}

function subtree(tree: TraitTree | null, key: string): TraitTree | null {
  if (!tree) return null;
  for (const [nodeKey, node] of Object.entries(tree)) {
    if (nodeKey === key) return childrenOf(node);
    const found = subtree(childrenOf(node), key);
    if (found) return found;
  }
  return null;
}

/** Every key below `key` in the tree. */
export function traitDescendants(tree: TraitTree | null | undefined, key: string): string[] {
  return allKeys(subtree(tree ?? null, key));
}

/**
 * The keys a creature with these trait values counts as having: each value, the categories
 * above it, and every member of a category it has chosen.
 */
export function expandTraits(tree: TraitTree | null | undefined, values: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    keys.add(value);
    for (const key of traitPath(tree, value)) keys.add(key);
    for (const key of traitDescendants(tree, value)) keys.add(key);
  }
  return [...keys];
}
