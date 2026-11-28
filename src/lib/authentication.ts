import type { Locale } from '#/i18n/locale'

export interface CurrentUser {
  id: string
  name: string
  email: string
  image: string | null
  githubUsername: string | null
}

export interface AuthenticationState {
  locale?: Locale
  localDataReceipt?: string
  user: CurrentUser | null
  profileCompleted: boolean
  isAdmin: boolean
  methods: {
    github: boolean
    google: boolean
    email: boolean
  }
}
