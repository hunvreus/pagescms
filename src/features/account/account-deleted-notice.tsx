import { useLingui as useUiMessages } from '@lingui/react/macro'
import { useEffect } from 'react'

export function AccountDeletedNotice({ onShown }: { onShown: () => void }) {
  const { t: _t } = useUiMessages()

  useEffect(() => {
    let mounted = true
    void import('sonner')
      .then(({ toast }) => {
        if (!mounted) return
        toast.success(_t({ message: 'Your account has been deleted.' }), {
          id: 'account-deleted',
        })
        onShown()
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [onShown])
  return null
}
