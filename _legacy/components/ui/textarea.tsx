import * as React from "react"

import { cn } from "@/lib/utils"

const supportsFieldSizing = () =>
  typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")

const setTextareaHeight = (element: HTMLTextAreaElement) => {
  element.style.height = "auto"
  element.style.height = `${element.scrollHeight}px`
}

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, onInput, style, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null)
    const shouldAutosize = React.useMemo(() => !supportsFieldSizing(), [])

    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, [])

    React.useEffect(() => {
      if (!shouldAutosize || !innerRef.current) return
      setTextareaHeight(innerRef.current)
    }, [shouldAutosize, props.value, props.defaultValue])

    return (
      <textarea
        ref={innerRef}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
          shouldAutosize && "overflow-hidden resize-none",
          className
        )}
        onInput={(event) => {
          if (shouldAutosize) setTextareaHeight(event.currentTarget)
          onInput?.(event)
        }}
        style={shouldAutosize ? { ...style, fieldSizing: "fixed" } : style}
        {...props}
      />
    )
  }
)

Textarea.displayName = "Textarea"

export { Textarea }
