import { useEffect, useState } from 'react'

export interface ReviewViewport {
  left: number
  top: number
  width: number
  height: number
}

export function reviewBounds(viewport: ReviewViewport) {
  const gap = viewport.width < 640 ? 8 : 24
  return {
    left: viewport.left + viewport.width / 2,
    top: viewport.top + gap,
    width: Math.max(1, viewport.width - gap * 2),
    maxWidth: 'calc(var(--container-3xl) * 2)',
    height: Math.max(1, viewport.height - gap * 2),
    translate: '-50% 0',
    transform: 'none',
  }
}

function visibleViewport(): ReviewViewport {
  const viewport = window.visualViewport
  return viewport
    ? {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        width: viewport.width,
        height: viewport.height,
      }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

// Pinch zoom and panning change the visible viewport without changing CSS vw.
export function useReviewViewport() {
  const [viewport, setViewport] = useState<ReviewViewport>(() =>
    typeof window === 'undefined'
      ? { left: 0, top: 0, width: 1024, height: 768 }
      : visibleViewport(),
  )
  useEffect(() => {
    const visual = window.visualViewport
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setViewport(visibleViewport()))
    }
    update()
    visual?.addEventListener('resize', update)
    visual?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      visual?.removeEventListener('resize', update)
      visual?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return {
    style: reviewBounds(viewport),
    columns: viewport.width >= 640,
    compact: viewport.height < 480,
  }
}
