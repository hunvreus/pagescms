import { it, expect } from 'vitest'
import { copyEntryMedia } from './i18n-media'

it('rebases only asset references, preserving prose links, code, titles and URL suffixes', () => {
  const media = [
    {
      name: 'default',
      input: 'public/images',
      output: '/images',
      extensions: [],
    },
  ]
  const body =
    '![A](../images/a.png?size=2#top "Title") [link](../images/a.png)\n`![code](../images/a.png)`\n```html\n<img src="../images/a.png">\n```\n<img src="../images/a.png"> <pre><img src="../images/a.png"></pre>'
  const result = copyEntryMedia(
    [
      { name: 'image', type: 'image' },
      { name: 'body', type: 'rich-text' },
      { name: 'plain', type: 'string' },
    ],
    { image: '../images/a.png', body, plain: '../images/a.png' },
    'content/posts/about.md',
    'content/fr/posts/about.md',
    media,
  )
  expect(result).toEqual({
    image: '../../images/a.png',
    plain: '../images/a.png',
    body: '![A](../../images/a.png?size=2#top "Title") [link](../images/a.png)\n`![code](../images/a.png)`\n```html\n<img src="../images/a.png">\n```\n<img src="../../images/a.png"> <pre><img src="../images/a.png"></pre>',
  })
})
it('keeps external/output URLs and maps a relative library asset to its repository identity', () => {
  const result = copyEntryMedia(
    [
      { name: 'image', type: 'image' },
      { name: 'body', type: 'rich-text' },
    ],
    { image: '../public/images/a.png', body: '![A](https://cdn.test/a.png)' },
    'content/about.md',
    'fr/content/about.md',
    [
      {
        name: 'default',
        input: 'public/images',
        output: 'https://cdn.test',
        extensions: [],
      },
    ],
  )
  expect(result).toEqual({
    image: 'public/images/a.png',
    body: '![A](https://cdn.test/a.png)',
  })
})

it('writes delivery URLs for rebased rich-text assets inside the configured library', () => {
  expect(
    copyEntryMedia(
      [{ name: 'body', type: 'rich-text' }],
      {
        body: '![A](../public/images/a.png) <img data-src="../ignore.png" alt="src=bogus" src="../public/images/a.png">',
      },
      'content/about.md',
      'fr/content/about.md',
      [
        {
          name: 'default',
          input: 'public/images',
          output: 'https://cdn.test/assets',
          extensions: [],
        },
      ],
    ),
  ).toEqual({
    body: '![A](https://cdn.test/assets/a.png) <img data-src="../ignore.png" alt="src=bogus" src="https://cdn.test/assets/a.png">',
  })
})
