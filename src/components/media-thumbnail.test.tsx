import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MediaThumbnail } from './media-thumbnail'

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
})
