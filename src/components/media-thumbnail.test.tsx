import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MediaThumbnail, mediaThumbnailPresentation } from './media-thumbnail'

const repository = {
  owner: 'pages-cms',
  repo: 'pagescms',
  branch: 'main',
  name: 'images',
}

describe('MediaThumbnail', () => {
  it('renders a stable empty placeholder when no image is configured', () => {
    const html = renderToStaticMarkup(
      <MediaThumbnail {...repository} path={null} />,
    )

    expect(html).toContain('data-state="empty"')
    expect(html).toContain('title="No image"')
    expect(html).not.toContain('<img')
  })

  it('renders a loader while an image request is pending', () => {
    const html = renderToStaticMarkup(
      <MediaThumbnail {...repository} path="uploads/photo.jpg" />,
    )

    expect(html).toContain('data-state="loading"')
    expect(html).toContain('title="Loading image"')
    expect(html).toContain('<img')
    expect(html).toContain('loading="lazy"')
  })

  it('uses a manifest download URL instead of the preview proxy', () => {
    const source = 'https://raw.example/photo.jpg?token=temporary'
    const html = renderToStaticMarkup(
      <MediaThumbnail
        {...repository}
        path="uploads/photo.jpg"
        source={source}
      />,
    )

    expect(html).toContain(`src="${source.replace('&', '&amp;')}"`)
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).not.toContain('/api/media-preview/')
  })

  it('shows renewal as loading instead of replacing the tile with an error', () => {
    const html = renderToStaticMarkup(
      <MediaThumbnail
        {...repository}
        loadingSource
        path="uploads/photo.jpg"
        source="https://raw.example/photo.jpg?token=expired"
      />,
    )

    expect(html).toContain('data-state="loading"')
    expect(html).toContain('title="Loading image"')
    expect(html).not.toContain('title="Could not load image"')
  })

  it('keeps a loaded thumbnail visible while a replacement lease preloads', () => {
    expect(
      mediaThumbnailPresentation({
        source: 'https://raw.example/new.png?token=new',
        loadingSource: true,
        displayedSource: 'https://raw.example/old.png?token=old',
        loadedSource: 'https://raw.example/old.png?token=old',
        failedSource: null,
      }),
    ).toMatchObject({
      hasUsableDisplayedImage: true,
      loading: false,
      state: 'loaded',
    })
  })

  it('keeps the previous thumbnail after a replacement candidate fails', () => {
    expect(
      mediaThumbnailPresentation({
        source: 'https://raw.example/new.png?token=new',
        loadingSource: false,
        displayedSource: 'https://raw.example/old.png?token=old',
        loadedSource: 'https://raw.example/old.png?token=old',
        failedSource: 'https://raw.example/new.png?token=new',
      }),
    ).toMatchObject({
      failed: true,
      hasUsableDisplayedImage: true,
      loading: false,
      state: 'loaded',
    })
  })
})
