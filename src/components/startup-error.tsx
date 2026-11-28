import { isLocale } from '#/i18n/locale'
import type { Locale } from '#/i18n/locale'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import appCss from '../styles.css?url'

// This recovery page must work when the translation chunks themselves fail.
const messages = {
  en: {
    title: 'Could not start the app',
    description:
      'Some application files could not be loaded. Check your connection and reload the page.',
    reload: 'Reload page',
  },
  fr: {
    title: 'Impossible de démarrer l’application',
    description:
      'Certains fichiers de l’application n’ont pas pu être chargés. Vérifiez votre connexion et rechargez la page.',
    reload: 'Recharger la page',
  },
  es: {
    title: 'No se pudo iniciar la aplicación',
    description:
      'No se pudieron cargar algunos archivos de la aplicación. Comprueba la conexión y vuelve a cargar la página.',
    reload: 'Volver a cargar la página',
  },
  'pt-BR': {
    title: 'Não foi possível iniciar o aplicativo',
    description:
      'Não foi possível carregar alguns arquivos do aplicativo. Verifique sua conexão e recarregue a página.',
    reload: 'Recarregar página',
  },
  'zh-CN': {
    title: '无法启动应用',
    description: '部分应用文件加载失败。请检查网络连接，然后重新加载页面。',
    reload: '重新加载页面',
  },
} satisfies Record<
  Locale,
  { title: string; description: string; reload: string }
>

export function StartupError() {
  const language = document.documentElement.lang
  const locale = isLocale(language) ? language : 'en'
  const text = messages[locale]
  return (
    <html lang={locale}>
      <head>
        <title>{text.title} | Pages CMS</title>
        <link rel="stylesheet" href={appCss} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <main className="flex min-h-svh items-center justify-center p-4 md:p-6">
          <Empty className="max-w-sm">
            <EmptyHeader>
              <EmptyTitle>{text.title}</EmptyTitle>
              <EmptyDescription>{text.description}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                {text.reload}
              </Button>
            </EmptyContent>
          </Empty>
        </main>
      </body>
    </html>
  )
}
