import { z } from 'zod'

export const localAccountsRequest = z.object({
  receipts: z.array(z.string().max(1024)).max(50),
})
