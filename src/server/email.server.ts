export type EmailAddress =
  | string
  | Readonly<{
      email: string
      name?: string
    }>

export type EmailMessage = Readonly<{
  from?: EmailAddress
  to: EmailAddress | readonly EmailAddress[]
  replyTo?: EmailAddress
  subject: string
  text?: string
  html?: string
}>

export interface EmailProvider {
  send: (message: EmailMessage) => Promise<void>
}
