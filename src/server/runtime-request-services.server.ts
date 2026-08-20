import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import {
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'

if (existsSync('.env.local')) loadEnvFile('.env.local')

function reportBackgroundFailure(error: unknown) {
  console.error('Background task failed', error)
}

export function createRuntimeRequestServices(request: Request) {
  return createRequestServices(
    process.env,
    {
      defer(task) {
        void task.catch(reportBackgroundFailure)
      },
    },
    request.headers,
  )
}

export function createRuntimeRequestServicesAccessor(request: Request) {
  return createRequestServicesAccessor(() =>
    createRuntimeRequestServices(request),
  )
}
