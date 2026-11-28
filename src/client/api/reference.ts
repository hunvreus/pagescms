import { apiMutation } from '#/client/api/index'
import type { readReferenceOptions as readOptions } from '#/server/services/reference'

type Input = unknown

export const readReferenceOptions = apiMutation<
  Input,
  Awaited<ReturnType<typeof readOptions>>
>('/api/references')
