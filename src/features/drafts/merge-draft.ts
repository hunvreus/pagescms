type Value = { exists: false } | { exists: true; value: unknown }
export type MergeSide = 'mine' | 'remote'
export interface DraftConflict {
  path: string[]
  mine: Value
  remote: Value
  original?: Value
}
type Node =
  | { kind: 'value'; value: Value }
  | { kind: 'object'; entries: [string, Node][] }
  | { kind: 'conflict'; index: number }
export interface DraftMerge<T> {
  conflicts: DraftConflict[]
  resolve: (choices: Partial<Record<number, MergeSide>>) => T
}
const absent: Value = { exists: false }
const present = (value: unknown): Value => ({ exists: true, value })
function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
}
export function equalMergeValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((value, i) => equalMergeValue(value, b[i]))
    )
  if (!object(a) || !object(b)) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && equalMergeValue(a[key], b[key]),
    )
  )
}
function equal(a: Value, b: Value) {
  return (
    a.exists === b.exists &&
    (!a.exists || (b.exists && equalMergeValue(a.value, b.value)))
  )
}
function child(parent: Record<string, unknown>, key: string): Value {
  return Object.hasOwn(parent, key) ? present(parent[key]) : absent
}

// Lists and text are atomic. Only plain objects with a known object baseline
// recurse; replacing/deleting an object conflicts with editing its children.
export function mergeDraft<T>(
  base: { value: T } | undefined,
  mine: T,
  remote: T,
  atomic: (path: string[]) => boolean = () => false,
): DraftMerge<T> {
  const conflicts: DraftConflict[] = []
  function walk(
    original: Value | undefined,
    local: Value,
    latest: Value,
    path: string[],
  ): Node {
    if (equal(local, latest)) return { kind: 'value', value: local }
    if (original && equal(local, original))
      return { kind: 'value', value: latest }
    if (original && equal(latest, original))
      return { kind: 'value', value: local }
    if (
      !atomic(path) &&
      original?.exists &&
      object(original.value) &&
      local.exists &&
      object(local.value) &&
      latest.exists &&
      object(latest.value)
    ) {
      const before = original.value,
        left = local.value,
        right = latest.value
      const keys = new Set([
        ...Object.keys(before),
        ...Object.keys(left),
        ...Object.keys(right),
      ])
      return {
        kind: 'object',
        entries: [...keys].map((key) => [
          key,
          walk(child(before, key), child(left, key), child(right, key), [
            ...path,
            key,
          ]),
        ]),
      }
    }
    const index = conflicts.length
    conflicts.push({ path, mine: local, remote: latest, original })
    return { kind: 'conflict', index }
  }
  const root = walk(
    base ? present(base.value) : undefined,
    present(mine),
    present(remote),
    [],
  )
  return {
    conflicts,
    resolve(choices) {
      function resolve(node: Node): Value {
        if (node.kind === 'value') return node.value
        if (node.kind === 'conflict') {
          const side = choices[node.index]
          if (!side)
            throw new Error('Choose a version for every conflicting field.')
          return conflicts[node.index][side]
        }
        return present(
          Object.fromEntries(
            node.entries.flatMap(([key, entry]) => {
              const value = resolve(entry)
              return value.exists ? [[key, value.value]] : []
            }),
          ),
        )
      }
      const result = resolve(root)
      if (!result.exists)
        throw new Error('The entry cannot be removed by a merge.')
      return result.value as T
    },
  }
}
