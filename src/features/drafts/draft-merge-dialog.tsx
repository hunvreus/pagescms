import { msg, plural } from '@lingui/core/macro'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { OperationError } from '#/components/operation-error'
import { Spinner } from '#/components/ui/spinner'
import { FieldError } from '#/components/ui/field'
import { fieldValidationIssues } from '#/shared/field-validation-error'
import { useId, useState } from 'react'
import { cn } from 'cn'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { conflictLabel, mergeField } from './draft-merge-fields'
import { DraftFieldPreview } from './draft-field-preview'
import { useReviewViewport } from './use-review-viewport'
import type { ReferenceContext } from '#/features/editor/fields/field-types'
import type { DraftMerge, MergeSide } from './merge-draft'

const sideLabels = {
  mine: msg({ message: 'Your changes' }),
  remote: msg({ message: 'Latest saved version' }),
}

export function DraftMergeDialog<T>({
  plan,
  loadError,
  fields,
  label,
  context,
  onApply,
  onClose,
}: {
  plan: DraftMerge<T>
  loadError?: unknown
  fields?: unknown
  label: string
  context?: ReferenceContext
  onApply: (value: T) => Promise<void>
  onClose: () => void
}) {
  const { t: _t, i18n: sideI18n } = useUiMessages()

  const viewport = useReviewViewport()
  const radioId = useId()
  const [choices, setChoices] = useState<Partial<Record<number, MergeSide>>>({})
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const count = plan.conflicts.length
  const remaining = plan.conflicts.filter((_, i) => !choices[i]).length
  const title = count
    ? _t({ message: 'Some changes need your review' })
    : _t({ message: 'Your changes are ready to combine' })
  const description = count
    ? _t({
        message: plural(count, {
          one: 'This entry was saved while you were editing. # field needs your review. Choose what to keep, then save your changes.',
          other:
            'This entry was saved while you were editing. # fields need your review. Choose what to keep, then save your changes.',
        }),
      })
    : _t({
        message:
          'Your changes can be combined with the latest saved version. Save to keep both sets of changes.',
      })
  const shortDescription = count
    ? _t({
        message: plural(count, {
          one: '# field to review. Choose what to keep.',
          other: '# fields to review. Choose what to keep.',
        }),
      })
    : _t({ message: 'No conflicts. Save to combine your changes.' })

  function chooseAllMine() {
    setChoices(Object.fromEntries(plan.conflicts.map((_, i) => [i, 'mine'])))
  }
  function choose(index: number, side: MergeSide) {
    setChoices((current) =>
      current[index] === side ? current : { ...current, [index]: side },
    )
  }
  async function apply() {
    setApplying(true)
    setError(null)
    try {
      await onApply(plan.resolve(choices))
    } catch (failure) {
      if (fieldValidationIssues(failure)) setError(failure)
    } finally {
      setApplying(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !applying) onClose()
      }}
    >
      <DialogContent
        style={viewport.style}
        className="max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-none [&>[data-slot=dialog-close]]:m-3"
        showCloseButton={!applying}
      >
        <DialogHeader
          className={cn(
            'min-w-0 px-4 pb-3 sm:px-6',
            viewport.compact ? 'pt-3' : 'pt-4 sm:pt-6',
          )}
        >
          <DialogTitle className="pr-8">{title}</DialogTitle>
          <DialogDescription className="max-w-4xl">
            {viewport.compact ? shortDescription : description}
          </DialogDescription>
        </DialogHeader>
        <div
          data-merge-scroll
          className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6"
        >
          <div
            data-merge-grid
            className={cn(
              'grid min-w-0 gap-x-3',
              viewport.columns
                ? 'grid-cols-[1rem_minmax(0,1fr)_0_1rem_minmax(0,1fr)]'
                : 'grid-cols-[1rem_minmax(0,1fr)]',
            )}
          >
            {count > 0 ? (
              <div
                data-merge-headings
                className="sticky top-0 z-10 col-span-full grid min-w-0 grid-cols-subgrid border-b bg-popover py-3"
              >
                <div className="col-span-2 col-start-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {viewport.columns ? (
                    <span className="font-medium">
                      {sideI18n._(sideLabels.mine)}
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className={viewport.columns ? 'ml-auto' : undefined}
                    disabled={applying}
                    onClick={chooseAllMine}
                  >
                    <UiTrans>Use all my changes</UiTrans>
                  </Button>
                </div>
                {viewport.columns ? (
                  <div className="col-span-2 col-start-4 row-start-1 flex items-center font-medium">
                    <span>{sideI18n._(sideLabels.remote)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {plan.conflicts.map((conflict, index) => {
              const name = conflictLabel(conflict.path, fields, label)
              const itemField = mergeField(conflict.path, fields)
              const list =
                (conflict.mine.exists && Array.isArray(conflict.mine.value)) ||
                (conflict.remote.exists && Array.isArray(conflict.remote.value))
              return (
                <section
                  key={JSON.stringify(conflict.path)}
                  aria-label={name}
                  className="col-span-full grid min-w-0 grid-cols-subgrid gap-y-3 border-b py-5 last:border-b-0"
                >
                  {list ? (
                    <p className="col-span-full text-xs text-muted-foreground">
                      <UiTrans>Choose one complete list.</UiTrans>
                    </p>
                  ) : null}
                  <RadioGroup
                    aria-label={name}
                    value={choices[index] ?? ''}
                    onValueChange={(side) => {
                      if (side === 'mine' || side === 'remote')
                        choose(index, side)
                    }}
                    orientation={viewport.columns ? 'horizontal' : 'vertical'}
                    disabled={applying}
                    className="col-span-full grid-cols-subgrid gap-x-3 gap-y-6"
                    data-merge-choices
                  >
                    {(['mine', 'remote'] as const).map((side) => {
                      const selected = choices[index] === side
                      return (
                        <div
                          key={side}
                          role="group"
                          aria-label={
                            name + ': ' + sideI18n._(sideLabels[side])
                          }
                          className={cn(
                            'col-span-2 grid min-w-0 cursor-pointer grid-cols-subgrid items-start gap-y-2',
                            viewport.columns && side === 'remote'
                              ? 'col-start-4'
                              : 'col-start-1',
                          )}
                          onClick={() => {
                            if (!applying) choose(index, side)
                          }}
                        >
                          {!viewport.columns ? (
                            <Label
                              htmlFor={`${radioId}-${index}-${side}`}
                              data-merge-version
                              className="col-span-full text-sm font-medium"
                            >
                              {sideI18n._(sideLabels[side])}
                            </Label>
                          ) : null}
                          <RadioGroupItem
                            id={`${radioId}-${index}-${side}`}
                            value={side}
                            aria-label={
                              name +
                              ': ' +
                              (side === 'mine'
                                ? _t({ message: 'Use my changes' })
                                : _t({ message: 'Use latest saved version' }))
                            }
                            className="col-start-1 mt-1"
                          />
                          <div
                            data-merge-value
                            className={cn(
                              'col-start-2 min-w-0',
                              choices[index] && !selected && 'opacity-50',
                            )}
                          >
                            <DraftFieldPreview
                              value={conflict[side]}
                              field={itemField}
                              fields={conflict.path.length ? undefined : fields}
                              label={name}
                              context={context}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </section>
              )
            })}
          </div>
          <FieldError errors={fieldValidationIssues(error)} />
          <OperationError
            error={loadError}
            title={_t({ message: 'Could not reload changes' })}
            fallback={_t({
              message:
                'Could not load the latest version. Your draft is retained.',
            })}
          />
        </div>
        <DialogFooter
          className={cn(
            'm-0 items-center gap-3 rounded-none sm:px-6',
            viewport.compact ? 'p-3' : 'p-4',
            viewport.columns || viewport.compact
              ? 'flex-row'
              : 'flex-col sm:flex-col',
          )}
        >
          <span
            role="status"
            className={cn(
              'text-sm text-muted-foreground',
              viewport.compact
                ? 'sr-only'
                : viewport.columns
                  ? 'mr-auto'
                  : 'w-full',
            )}
          >
            {remaining
              ? _t({
                  message: plural(remaining, {
                    one: '# field left to review',
                    other: '# fields left to review',
                  }),
                })
              : _t({ message: 'Ready to save' })}
          </span>
          <div
            className={cn(
              'flex justify-end gap-2',
              viewport.columns ? 'w-auto' : 'w-full',
            )}
          >
            <Button variant="outline" disabled={applying} onClick={onClose}>
              <UiTrans>Cancel</UiTrans>
            </Button>
            <Button
              aria-busy={applying}
              disabled={applying || remaining > 0}
              onClick={() => void apply()}
            >
              <UiTrans>Save changes</UiTrans>
              {applying ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
