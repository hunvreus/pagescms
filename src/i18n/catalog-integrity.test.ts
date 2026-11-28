import { expect, it } from 'vitest'
import { messages as english } from '../locales/en/messages.po'
import { messages as french } from '../locales/fr/messages.po'
import { messages as spanish } from '../locales/es/messages.po'
import { messages as portuguese } from '../locales/pt-BR/messages.po'
import { messages as chinese } from '../locales/zh-CN/messages.po'

function argumentsIn(value: unknown): string[] {
  const names = new Set<string>()
  function tokens(input: unknown) {
    if (!Array.isArray(input)) return
    for (const token of input as unknown[]) {
      if (Array.isArray(token) && typeof token[0] === 'string') {
        names.add(
          token[0] +
            ':' +
            (token[1] === 'plural' || token[1] === 'select'
              ? token[1]
              : 'value'),
        )
        if (token[2] && typeof token[2] === 'object')
          for (const choice of Object.values(
            token[2] as Record<string, unknown>,
          ))
            tokens(choice)
      }
    }
  }
  tokens(value)
  return [...names].sort()
}
it.each([
  ['French', french],
  ['Spanish', spanish],
  ['Portuguese', portuguese],
  ['Chinese', chinese],
] as const)(
  'keeps every %s message and its interpolation arguments aligned with English',
  (_, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort())
    for (const [id, source] of Object.entries(english))
      expect(argumentsIn(catalog[id]), id).toEqual(argumentsIn(source))
  },
)
