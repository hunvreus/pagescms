import { useEffect } from 'react'

const unsavedWarningDisabled =
  import.meta.env.VITE_DISABLE_UNSAVED_WARNING === 'true'

export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty || unsavedWarningDisabled) return

    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}
