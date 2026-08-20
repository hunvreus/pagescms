import {
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'

export function createRequestServicesForRequest(request: Request) {
  return createRequestServices(process.env, request.headers)
}

export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
