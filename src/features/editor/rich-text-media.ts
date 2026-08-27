import { mediaAssetUrl } from '#/lib/media-assets'
import { mediaInputPath, mediaOutputPath } from '#/lib/media-field-values'

import type { FieldMediaSchema } from '#/lib/media-field-values'

export interface RichTextMediaContext {
  owner: string
  repo: string
  branch: string
  name: string
}

function isExternalPath(path: string) {
  return /^(?:https?:)?\/\//i.test(path) || path.startsWith('data:')
}

function previewPath(
  path: string,
  media: FieldMediaSchema,
  context: RichTextMediaContext,
) {
  if (!path || isExternalPath(path)) return path
  const inputPath = mediaInputPath(path, media)
  if (
    media.input &&
    inputPath !== media.input &&
    !inputPath.startsWith(`${media.input}/`)
  ) {
    return path
  }
  return mediaAssetUrl({ ...context, path: inputPath })
}

function persistedPath(
  path: string,
  media: FieldMediaSchema,
  context: RichTextMediaContext,
) {
  const prefix = mediaAssetUrl({ ...context, path: '' })
  if (!path.startsWith(prefix)) return path
  const encodedPath = path.slice(prefix.length)
  const inputPath = encodedPath
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join('/')
  return mediaOutputPath(inputPath, media)
}

function transformImageSources(
  content: string,
  transform: (source: string) => string,
) {
  const markdownWithBracketedDestination = content.replace(
    /(!\[[^\]]*\]\(\s*<)([^>\n]+)(>)/g,
    (_match, before: string, source: string, after: string) =>
      `${before}${transform(source)}${after}`,
  )
  const markdown = markdownWithBracketedDestination.replace(
    /(!\[[^\]]*\]\(\s*)([^\s)<]+)([^)]*\))/g,
    (_match, before: string, source: string, after: string) =>
      `${before}${transform(source)}${after}`,
  )
  return markdown.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)(\2)/gi,
    (_match, before: string, quote: string, source: string) =>
      `${before}${quote}${transform(source)}${quote}`,
  )
}

export function richTextValueForEditor(
  content: string,
  media: FieldMediaSchema | undefined,
  context: RichTextMediaContext | undefined,
) {
  if (!media || !context) return content
  return transformImageSources(content, (source) =>
    previewPath(source, media, context),
  )
}

export function richTextValueForStorage(
  content: string,
  media: FieldMediaSchema | undefined,
  context: RichTextMediaContext | undefined,
) {
  if (!media || !context) return content
  return transformImageSources(content, (source) =>
    persistedPath(source, media, context),
  )
}
