// Sessionless authorized operations shared by the API and
// trusted in-process extensions. Callers authenticate the account first; every
// operation re-resolves repository admission and runs the access policy.
export {
  loadServiceUser,
  serviceUserFromSession,
  requireSessionServiceUser,
} from '#/server/services/context'
export type { ServiceContext, ServiceUser } from '#/server/services/context'
export {
  createRawEntry,
  createStructuredEntry,
  deleteEntry,
  moveEntry,
  readCollection,
  readFixedFile,
  readRawEntry,
  renameEntry,
  saveRawEntry,
  saveFixedFile,
  saveStructuredEntry,
} from '#/server/services/content'
export {
  deleteMediaFile,
  readMediaDelivery,
  readMediaDirectory,
  uploadMediaFile,
} from '#/server/services/media'
export { readActions, runRepositoryAction } from '#/server/services/actions'
export type { ActionContextType } from '#/server/services/actions'
export {
  listRepositoryBranches,
  readRepository,
} from '#/server/services/repository'
export { readEntryTranslations } from '#/server/services/entry-translations'
export { classifyOperationError } from '#/server/services/errors'
export type {
  ClassifiedOperationError,
  OperationErrorKind,
} from '#/server/services/errors'
export {
  findRepositoryIdentityByExternalId,
  searchRepositoryIdentities,
} from '#/server/access/repository-identity'
export {
  requireRepositoryManager,
  resolveRepositoryPrincipal,
} from '#/server/access/repository-policy'
