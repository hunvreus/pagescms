import { formatDistanceToNow as distance } from 'date-fns'
import { enUS, fr, es, ptBR, zhCN } from 'date-fns/locale'

export function formatDistanceToNow(
  value: Date | number,
  options: { addSuffix?: boolean },
  locale: string,
) {
  return distance(value, {
    ...options,
    locale:
      (
        { en: enUS, fr, es, 'pt-BR': ptBR, 'zh-CN': zhCN } as Record<
          string,
          typeof enUS
        >
      )[locale] ?? enUS,
  })
}
