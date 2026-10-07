export const PROJECT_TEMPLATES = [
  {
    name: 'Next.js blog',
    repository: 'pagescms/nextjs-blog-template',
    suggestedName: 'nextjs-blog',
    thumbnail: '/images/nextjs-blog-template.webp',
  },
  {
    name: 'Astro blog',
    repository: 'pagescms/astro-blog-template',
    suggestedName: 'astro-blog',
    thumbnail: '/images/astro-blog-template.webp',
  },
  {
    name: 'Eleventy blog',
    repository: 'pagescms/eleventy-blog-template',
    suggestedName: 'eleventy-blog',
    thumbnail: '/images/eleventy-blog-template.webp',
  },
] as const

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number]
