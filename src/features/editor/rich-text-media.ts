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
  let decodedPath = path
  try {
    decodedPath = decodeURIComponent(path)
  } catch {
    // Keep malformed URL escapes as literal filename characters.
  }
  const inputPath = mediaInputPath(decodedPath, media)
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
  decodedDestinations = false,
) {
  const markdownWithBracketedDestination = content.replace(
    /(!\[[^\]]*\]\(\s*<)([^>\n]+)(>)/g,
    (_match, before: string, source: string, after: string) => {
      const destination = transform(source)
      const encoded =
        decodedDestinations && destination !== source
          ? destination.replace(/%/g, '%25')
          : destination
      return `${before}${encoded}${after}`
    },
  )
  const markdown = markdownWithBracketedDestination.replace(
    /(!\[[^\]]*\]\(\s*)([^\s)<]+)([^)]*\))/g,
    (_match, before: string, source: string, after: string) => {
      // Bare Markdown destinations cannot contain spaces or closing parentheses.
      const transformed = transform(source)
      const destination =
        decodedDestinations && transformed !== source
          ? encodeURI(transformed)
          : transformed
      const encoded =
        transformed !== source
          ? destination.replace(
              /[()<>]/g,
              (character) =>
                `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
            )
          : destination
      return `${before}${encoded}${after}`
    },
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
  return transformImageSources(
    content,
    (source) => persistedPath(source, media, context),
    true,
  )
}
