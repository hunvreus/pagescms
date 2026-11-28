export const largeMarkdownCollection = `  - name: codex-large-body
    label: Large body fixture
    type: collection
    path: content/codex-large-body
    extension: md
    format: yaml-frontmatter
    fields:
      - name: title
        type: string
      - name: body
        type: rich-text
    view:
      fields: [title]
`

export function largeMarkdownFiles() {
  return Array.from({ length: 500 }, (_, index) => {
    const number = String(index).padStart(4, '0')
    const body = `Paragraph ${number}: ${'Fixture body text for a realistic content file. '.repeat(130)}\n`
    return {
      path: `content/codex-large-body/entry-${number}.md`,
      content: `---\ntitle: Large fixture ${number}\n---\n${body}`,
      sha: index.toString(16).padStart(40, '0'),
    }
  })
}
