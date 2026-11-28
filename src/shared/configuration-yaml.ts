import { limitAliasExpansion } from '#/shared/yaml-aliases'
import {
  COLLECTION_STYLE,
  CORE_SCHEMA,
  EVENT_ID,
  SCALAR_STYLE,
  constructFromEvents,
  getScalarValue,
  parseEvents,
} from 'js-yaml'
import type { Event, ScalarEvent } from 'js-yaml'
import type { ConfigurationSourceDiagnostic } from './configuration-source'

export type SourceNode = {
  from: number | null
  to: number | null
  keys?: Map<string, { key: SourceNode; value: SourceNode }>
  items?: SourceNode[]
}

export function readYamlSource(source: string) {
  const diagnostics: ConfigurationSourceDiagnostic[] = []
  if (!source.trim()) return { root: undefined, configuration: {}, diagnostics }
  let events: Event[]
  const input = source
  try {
    events = parseEvents(input, {})
  } catch (error) {
    const value = error as {
      reason?: string
      message?: string
      mark?: { position?: number }
    }
    const position = value.mark?.position ?? null
    diagnostics.push({
      severity: 'error',
      code: value.reason?.includes('indentation')
        ? 'BAD_INDENT'
        : 'YAML_PARSE_ERROR',
      from: position,
      to: position === null ? null : position + 1,
      message: value.reason ?? value.message ?? 'Could not parse YAML.',
    })
    return { root: undefined, configuration: {}, diagnostics }
  }
  let index = 0
  const anchors = new Map<string, SourceNode>()
  const stack: SourceNode[] = []
  const invalidAliases = new Set<number>()
  function scalarRange(event: ScalarEvent): SourceNode {
    const quoted =
      event.style === SCALAR_STYLE.SINGLE_QUOTED ||
      event.style === SCALAR_STYLE.DOUBLE_QUOTED
    return {
      from: event.valueStart < 0 ? null : event.valueStart - (quoted ? 1 : 0),
      to: event.valueEnd < 0 ? null : event.valueEnd + (quoted ? 1 : 0),
    }
  }
  function node(): SourceNode {
    const event = events[index++]
    if (event.type === EVENT_ID.ALIAS) {
      const name = input.slice(event.anchorStart, event.anchorEnd)
      const result = { from: event.anchorStart - 1, to: event.anchorEnd }
      const target = anchors.get(name)
      if (!target || stack.includes(target)) {
        invalidAliases.add(index - 1)
        diagnostics.push({
          severity: 'error',
          code: target ? 'CYCLIC_ALIAS' : 'UNRESOLVED_ALIAS',
          ...result,
          message: target
            ? `Alias '*${name}' creates a circular reference.`
            : `Alias '*${name}' must reference an earlier anchor.`,
        })
      }
      return result
    }
    if (event.type === EVENT_ID.SCALAR) {
      const result = scalarRange(event)
      if (event.anchorStart >= 0)
        anchors.set(input.slice(event.anchorStart, event.anchorEnd), result)
      return result
    }
    if (event.type !== EVENT_ID.MAPPING && event.type !== EVENT_ID.SEQUENCE)
      return { from: null, to: null }
    const result: SourceNode = {
      from: event.start,
      to: event.start,
      ...(event.type === EVENT_ID.MAPPING
        ? { keys: new Map() }
        : { items: [] }),
    }
    if (event.anchorStart >= 0)
      anchors.set(input.slice(event.anchorStart, event.anchorEnd), result)
    stack.push(result)
    while (events[index] && events[index].type !== EVENT_ID.POP) {
      if (event.type === EVENT_ID.SEQUENCE) {
        const child = node()
        result.items!.push(child)
        result.to = child.to ?? result.to
      } else {
        const keyEvent = events[index]
        const key = node()
        const value = node()
        result.to = value.to ?? key.to ?? result.to
        if (keyEvent.type === EVENT_ID.SCALAR) {
          const name = getScalarValue(input, keyEvent)
          if (result.keys!.has(name))
            diagnostics.push({
              severity: 'error',
              code: 'DUPLICATE_KEY',
              from: key.from,
              to: key.from === null ? null : key.from + 1,
              message: 'Map keys must be unique',
            })
          result.keys!.set(name, { key, value })
        }
      }
    }
    index++
    stack.pop()
    if (result.to !== null) {
      if (event.style === COLLECTION_STYLE.FLOW) {
        const closing = event.type === EVENT_ID.SEQUENCE ? ']' : '}'
        const end = input.indexOf(closing, result.to)
        if (end >= 0) result.to = end + 1
      } else if (input[result.to] === '\n') result.to++
      else if (input.slice(result.to, result.to + 2) === '\r\n') result.to += 2
    }
    return result
  }
  let root: SourceNode | undefined
  const documentEvents = events.filter(
    (event) => event.type === EVENT_ID.DOCUMENT,
  )
  if (documentEvents.length > 1) {
    const separators = [...source.matchAll(/^---(?:\s|$)/gm)]
    const from = separators.at(-1)?.index ?? null
    diagnostics.push({
      severity: 'error',
      code: 'MULTIPLE_DOCS',
      from,
      to: from === null ? null : source.length,
      message: 'Source contains multiple documents.',
    })
  }
  if (events[index]?.type === EVENT_ID.DOCUMENT) {
    index++
    if (events[index]?.type !== EVENT_ID.POP) root = node()
  }
  let configuration: unknown = {}
  try {
    const safeEvents = events.map<Event>((event, eventIndex) =>
      invalidAliases.has(eventIndex)
        ? {
            type: EVENT_ID.SCALAR,
            valueStart: 0,
            valueEnd: 0,
            anchorStart: -1,
            anchorEnd: -1,
            tagStart: -1,
            tagEnd: -1,
            style: SCALAR_STYLE.PLAIN,
            chomping: 1,
            indent: -1,
            fast: true,
          }
        : event,
    )
    configuration =
      constructFromEvents(safeEvents, {
        source: input,
        schema: CORE_SCHEMA,
        json: true,
      })[0] ?? {}
    limitAliasExpansion(configuration)
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'YAML_CONVERSION_ERROR',
      from: root?.from ?? null,
      to: root?.to ?? null,
      message:
        error instanceof Error ? error.message : 'Could not read YAML values.',
    })
  }

  return { root, configuration, diagnostics }
}

export function sourceNode(root: SourceNode | undefined, path: PropertyKey[]) {
  let node = root
  for (const part of path) {
    node =
      typeof part === 'number'
        ? node?.items?.[part]
        : node?.keys?.get(String(part))?.value
    if (!node) return undefined
  }
  return node
}
