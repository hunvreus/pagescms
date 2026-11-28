import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { languages } from '@codemirror/language-data'

export function codeEditorLanguage(format: string) {
  switch (format.toLowerCase()) {
    case 'yaml':
    case 'yml':
      return yaml()
    case 'javascript':
    case 'js':
    case 'jsx':
      return javascript({ jsx: true })
    case 'typescript':
    case 'ts':
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'json':
      return json()
    case 'html':
    case 'htm':
      return html()
    default:
      return markdown({ base: markdownLanguage, codeLanguages: languages })
  }
}
