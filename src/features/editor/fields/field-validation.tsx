import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  localizedContentIssues,
  contentValidationIssues,
} from '#/lib/content-validation'
import {
  fieldValidationError,
  fieldValidationIssues,
} from '#/shared/field-validation-error'
import type { ReactNode } from 'react'
import type { FieldIssue } from '#/lib/field-values'
import type { FieldMediaSchema } from '#/lib/media-field-values'
import type { JsonObject, JsonValue } from '#/shared/json'

const FieldValidationContext = createContext<{
  issues: FieldIssue[]
  clear: (path: string) => void
}>({ issues: [], clear: () => undefined })

export function useFieldIssues(path: string, includeChildren = false) {
  const context = useContext(FieldValidationContext)
  return {
    messages: context.issues.filter(
      (issue) =>
        issue.path === path ||
        (includeChildren && issue.path.startsWith(`${path}.`)),
    ),
    hasErrors: context.issues.some(
      (issue) => issue.path === path || issue.path.startsWith(`${path}.`),
    ),
    clear: context.clear,
    issues: context.issues,
  }
}

export function FieldValidationProvider({
  children,
  validation,
}: {
  children: ReactNode
  validation: { issues: FieldIssue[]; clear: (path: string) => void }
}) {
  const context = useMemo(
    () => ({ issues: validation.issues, clear: validation.clear }),
    [validation.issues, validation.clear],
  )
  return (
    <FieldValidationContext.Provider value={context}>
      {children}
    </FieldValidationContext.Provider>
  )
}

export function useFieldValidation(
  fields: unknown[],
  media: FieldMediaSchema[],
  list?: unknown,
  externalError?: unknown,
  localizationSchema?: Record<string, unknown>,
) {
  const [issues, setIssues] = useState<FieldIssue[]>([])
  const [unrendered, setUnrendered] = useState<FieldIssue[]>([])
  const activeIssues = useRef<FieldIssue[]>([])
  const [attempt, setAttempt] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const firstPath = useRef<string>(undefined)
  const secondFrame = useRef<number>(undefined)
  useEffect(() => {
    if (!attempt) return
    // Allow nested groups to expand before locating the first invalid control.
    const frame = requestAnimationFrame(() => {
      const frame2 = requestAnimationFrame(() => {
        const elements =
          root.current?.querySelectorAll<HTMLElement>('[data-field-path]')
        setUnrendered(
          activeIssues.current.filter(
            (issue) =>
              !Array.from(elements ?? []).some(
                (item) =>
                  item.dataset.fieldPath === issue.path ||
                  (item.dataset.fieldLeaf === 'true' &&
                    issue.path.startsWith(`${item.dataset.fieldPath}.`)),
              ),
          ),
        )
        const element =
          Array.from(elements ?? []).find(
            (item) => item.dataset.fieldPath === firstPath.current,
          ) ??
          Array.from(elements ?? [])
            .reverse()
            .find((item) =>
              firstPath.current?.startsWith(`${item.dataset.fieldPath}.`),
            )
        const control = element?.querySelector<HTMLElement>(
          'input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),[contenteditable="true"],button[role="combobox"]',
        )
        ;(control ?? element)?.focus()
      })
      secondFrame.current = frame2
    })
    return () => {
      cancelAnimationFrame(frame)
      if (secondFrame.current) cancelAnimationFrame(secondFrame.current)
    }
  }, [attempt])
  useEffect(() => {
    const next = fieldValidationIssues(externalError)
    if (!next) return
    activeIssues.current = next
    firstPath.current = next[0]?.path
    setIssues(next)
    setAttempt((current) => current + 1)
  }, [externalError])
  function show(next: FieldIssue[]) {
    activeIssues.current = next
    firstPath.current = next[0]?.path
    setIssues(next)
    if (next.length) setAttempt((value) => value + 1)
    return next.length === 0
  }
  const clear = useCallback((path: string) => {
    setIssues((current) =>
      current.some(
        (issue) =>
          issue.path === path ||
          issue.path.startsWith(`${path}.`) ||
          path.startsWith(`${issue.path}.`),
      )
        ? current.filter(
            (issue) =>
              issue.path !== path &&
              !issue.path.startsWith(`${path}.`) &&
              !path.startsWith(`${issue.path}.`),
          )
        : current,
    )
  }, [])

  return {
    root,
    issues,
    getIssues: () => activeIssues.current,
    unrenderedIssues: unrendered.filter((issue) => issues.includes(issue)),
    validate(content: JsonObject | JsonValue[]) {
      return show(
        localizationSchema
          ? localizedContentIssues(localizationSchema, content, media)
          : contentValidationIssues(fields, content, media, list),
      )
    },
    assert(content: JsonObject | JsonValue[]) {
      const next = localizationSchema
        ? localizedContentIssues(localizationSchema, content, media)
        : contentValidationIssues(fields, content, media, list)
      if (!show(next)) throw fieldValidationError(next)
    },
    accept(error: unknown) {
      const next = fieldValidationIssues(error)
      if (!next) return false
      show(next)
      return true
    },
    clear,
  }
}
