import { useEffect, useState } from 'react'

export function useSidebarScroll() {
  const [content, ref] = useState<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({
    scrolled: false,
    showFooterBorder: false,
  })

  useEffect(() => {
    if (!content) return
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = content
      const overflow = scrollHeight > clientHeight + 1
      const scrolled = scrollTop > 0
      const showFooterBorder =
        overflow && scrollTop + clientHeight < scrollHeight - 1
      setEdges((current) =>
        current.scrolled === scrolled &&
        current.showFooterBorder === showFooterBorder
          ? current
          : { scrolled, showFooterBorder },
      )
    }
    const resize = new ResizeObserver(update)
    const observe = () => {
      resize.disconnect()
      resize.observe(content)
      for (const child of content.children) resize.observe(child)
      update()
    }
    const changes = new MutationObserver(observe)
    observe()
    changes.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    content.addEventListener('scroll', update, { passive: true })
    return () => {
      resize.disconnect()
      changes.disconnect()
      content.removeEventListener('scroll', update)
    }
  }, [content])

  return { ref, ...edges }
}
