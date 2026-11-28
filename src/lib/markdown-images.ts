/** Rewrite inline image destinations without losing balanced brackets or titles. */
export function rewriteMarkdownImages(
  source: string,
  transform: (url: string, wrapped: boolean) => string,
  htmlImages = false,
) {
  const closing = (start: number, open: string, close: string) => {
    let depth = 1
    let quote = ''
    let angle = false
    for (let i = start; i < source.length; i++) {
      const char = source[i]
      if (char === '\\') {
        i++
        continue
      }
      if (open === '(') {
        if (quote) {
          if (char === quote) quote = ''
          continue
        }
        if (
          (char === '"' || char === "'") &&
          depth === 1 &&
          /\s/.test(source[i - 1] ?? '')
        ) {
          quote = char
          continue
        }
        if (char === '<') angle = true
        if (char === '>') {
          angle = false
          continue
        }
        if (angle) continue
      }
      if (char === open) depth++
      if (char === close && --depth === 0) return i
    }
    return -1
  }
  let output = ''
  let cursor = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\') {
      i++
      continue
    }
    const lineStart = source.lastIndexOf('\n', i - 1) + 1
    if (
      (source[i] === '`' || source[i] === '~') &&
      /^ {0,3}$/.test(source.slice(lineStart, i))
    ) {
      const run = /^(?:`{3,}|~{3,})/.exec(source.slice(i))?.[0]
      if (run) {
        const lineEnd = source.indexOf('\n', i + run.length)
        if (lineEnd < 0) break
        const closingFence = new RegExp(
          '^ {0,3}' + run[0] + '{' + run.length + ',}[ \t]*\r?$',
          'gm',
        )
        closingFence.lastIndex = lineEnd + 1
        const match = closingFence.exec(source)
        if (!match) break
        i = match.index + match[0].length - 1
        continue
      }
    }
    if (source[i] === '`') {
      const run = /^`+/.exec(source.slice(i))![0]
      const end = source.indexOf(run, i + run.length)
      if (end >= 0) {
        i = end + run.length - 1
        continue
      }
    }
    if (htmlImages && source[i] === '<') {
      const tag = /^<(?:"[^"]*"|'[^']*'|[^'">])*>/.exec(source.slice(i))?.[0]
      if (tag) {
        const blocked = /^<(pre|code|script|style)\b/i.exec(tag)
        if (blocked) {
          const close = new RegExp('</' + blocked[1] + '\\s*>', 'ig')
          close.lastIndex = i + tag.length
          const match = close.exec(source)
          if (!match) break
          i = match.index + match[0].length - 1
          continue
        }
        if (/^<img\b/i.test(tag)) {
          const attributes =
            /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
          let src: RegExpExecArray | null = null
          let attribute: RegExpExecArray | null
          while ((attribute = attributes.exec(tag))) {
            if (attribute[1].toLowerCase() === 'src') {
              src = attribute
              break
            }
          }
          if (src) {
            const original = src[2] || src[3] || src[4] || ''
            const start =
              i + src.index + src[0].indexOf(original, src[0].indexOf('=') + 1)
            const next = transform(original, true)
            if (next !== original) {
              output += source.slice(cursor, start) + next
              cursor = start + original.length
            }
          }
        }
        i += tag.length - 1
        continue
      }
    }
    if (source[i] !== '!' || source[i + 1] !== '[') continue
    const altEnd = closing(i + 2, '[', ']')
    if (altEnd < 0 || source[altEnd + 1] !== '(') continue
    const start = altEnd + 2
    const end = closing(start, '(', ')')
    if (end < 0) continue
    const target = source.slice(start, end)
    const leading = /^\s*/.exec(target)![0].length
    const wrapped = target[leading] === '<'
    const urlStart = start + leading + (wrapped ? 1 : 0)
    let urlEnd = end
    if (wrapped) {
      const angleEnd = source.indexOf('>', urlStart)
      if (angleEnd < 0 || angleEnd >= end) continue
      urlEnd = angleEnd
    } else {
      // A title is separated by whitespace; balanced parentheses belong to URL.
      let depth = 0
      for (let pos = urlStart; pos < end; pos++) {
        const char = source[pos]
        if (char === '\\') {
          pos++
          continue
        }
        if (char === '(') depth++
        if (char === ')') depth--
        if (/\s/.test(char) && depth === 0) {
          urlEnd = pos
          break
        }
      }
    }
    const original = source.slice(urlStart, urlEnd)
    const next = transform(original, wrapped)
    if (next !== original) {
      output += source.slice(cursor, urlStart) + next
      cursor = urlEnd
    }
    i = end
  }
  return output + source.slice(cursor)
}
