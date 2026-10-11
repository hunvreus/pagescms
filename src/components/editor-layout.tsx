import type { ReactNode } from 'react'

export function EditorLayout({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <div className="-m-4 md:-m-6">
      {header}
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">{children}</div>
    </div>
  )
}
