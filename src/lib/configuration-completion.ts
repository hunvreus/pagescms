import { autocompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionContext } from '@codemirror/autocomplete'
import type { z } from 'zod'

import { DeploymentMediaConfigurationShape } from '#/shared/configuration-schema'

/** Complete properties directly inside a top-level media object or list item. */
export function mediaCompletionAt(
  source: string,
  position: number,
): number | null {
  const before = source.slice(0, position)
  const lines = before.split('\n')
  const line = lines.pop() ?? ''
  const match = /^(\s*)(?:-\s+)?([\w-]*)$/.exec(line)
  if (!match) return null
  const indent = match[1].length
  let mediaLine = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const current = lines[i]
    if (!current.trim() || /^\s*#/.test(current)) continue
    if (/^media:\s*(?:#.*)?$/.test(current)) {
      mediaLine = i
      break
    }
    if (/^\S/.test(current)) return null
  }
  if (mediaLine < 0 || indent < 2) return null
  const children = lines
    .slice(mediaLine + 1)
    .filter((value) => value.trim() && !/^\s*#/.test(value))
  const first = children[0]
  if (first) {
    const leading = first.match(/^\s*/)?.[0].length ?? 0
    const item = /^\s*-\s/.test(first)
    const expected = leading + (item ? 2 : 0)
    if (
      indent !== expected &&
      !(item && indent === leading && /^\s*-\s/.test(line))
    )
      return null
  }
  return position - match[2].length
}

export function createMediaCompletion(shape: Record<string, z.ZodType>) {
  const options: Completion[] = Object.entries(shape).map(([name, schema]) => ({
    label: name,
    type: 'property',
    apply: `${name}: `,
    ...(schema.description ? { info: schema.description } : {}),
  }))
  return (context: CompletionContext) => {
    const from = mediaCompletionAt(context.state.doc.toString(), context.pos)
    return from === null ? null : { from, options, validFor: /^[\w-]*$/ }
  }
}

export const configurationCompletion = autocompletion({
  override: [createMediaCompletion(DeploymentMediaConfigurationShape)],
})
