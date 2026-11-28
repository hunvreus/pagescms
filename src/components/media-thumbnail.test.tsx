import { TestI18n } from '#/i18n/test-provider'
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
      <TestI18n>{<MediaThumbnail {...repository} path={null} />}</TestI18n>,
    )

    expect(html).toContain('data-state="empty"')
    expect(html).toContain('title="No image"')
    expect(html).not.toContain('<img')
  })

  it('renders a loader while an image request is pending', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {<MediaThumbnail {...repository} path="uploads/photo.jpg" />}
      </TestI18n>,
    )

    expect(html).toContain('data-state="loading"')
    expect(html).toContain('title="Loading image"')
    expect(html).toContain('<img')
    expect(html).toContain('loading="lazy"')
  })

  it('uses a manifest download URL instead of the preview proxy', () => {
    const source = 'https://raw.example/photo.jpg?token=temporary'
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <MediaThumbnail
            {...repository}
            path="uploads/photo.jpg"
            source={source}
          />
        }
      </TestI18n>,
    )

    expect(html).toContain(`src="${source.replace('&', '&amp;')}"`)
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).not.toContain('/api/media-preview/')
  })

  it('shows renewal as loading instead of replacing the tile with an error', () => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <MediaThumbnail
            {...repository}
            loadingSource
            path="uploads/photo.jpg"
            source="https://raw.example/photo.jpg?token=expired"
          />
        }
      </TestI18n>,
    )

    expect(html).toContain('data-state="loading"')
    expect(html).toContain('title="Loading image"')
    expect(html).not.toContain('title="Could not load image"')
  })
})
