import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { pagedQuery, validatedRead, validatedWrite } from './shared'
import { parseEntryRequest, parseEntryHistory } from '#/shared/requests/entry'
import {
  parseEntryUpdate,
  parseStructuredEntryUpdate,
  parseRawEntryCreate,
  parseStructuredEntryCreate,
  parseEntryDelete,
  parseEntryRename,
  parseEntryMove,
  parseEntryRenamePlan,
  parseCollectionFolderCreate,
} from '#/shared/requests/entry-write'
import { parseCollectionRequest } from '#/shared/requests/collection'
import { parseReferenceRequest } from '#/shared/requests/reference'
import { readReferenceOptions } from '#/server/services/reference'
import { parseFileRequest } from '#/shared/requests/fixed-file'
import { readEntryTranslations } from '#/server/services/entry-translations'
import {
  readCollection,
  readFixedFile,
  readRawEntry,
  planEntryRename,
  readEntryHistory,
  saveRawEntry,
  saveStructuredEntry,
  createRawEntry,
  createStructuredEntry,
  createCollectionFolder,
  deleteEntry,
  renameEntry,
  moveEntry,
} from '#/server/services/content'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/entries/rename-plan',
  validatedRead(parseEntryRenamePlan, planEntryRename),
)

router.get(
  '/api/entries/history',
  validatedRead(
    (query) => parseEntryHistory(pagedQuery(query)),
    readEntryHistory,
  ),
)

router.get(
  '/api/entries/translations',
  validatedRead(parseEntryRequest, readEntryTranslations),
)

router.patch('/api/entries/raw', validatedWrite(parseEntryUpdate, saveRawEntry))

router.patch(
  '/api/entries/structured',
  validatedWrite(parseStructuredEntryUpdate, saveStructuredEntry),
)

router.post(
  '/api/entries/raw',
  validatedWrite(parseRawEntryCreate, createRawEntry),
)

router.post(
  '/api/entries/structured',
  validatedWrite(parseStructuredEntryCreate, createStructuredEntry),
)

router.post(
  '/api/entry-folders',
  validatedWrite(parseCollectionFolderCreate, createCollectionFolder),
)

router.delete('/api/entries', validatedWrite(parseEntryDelete, deleteEntry))

router.patch('/api/entries/name', validatedWrite(parseEntryRename, renameEntry))

router.patch('/api/entries/path', validatedWrite(parseEntryMove, moveEntry))

router.get(
  '/api/collections',
  validatedRead(parseCollectionRequest, readCollection),
)

router.post(
  '/api/references',
  validatedWrite(parseReferenceRequest, readReferenceOptions),
)

router.get('/api/files', validatedRead(parseFileRequest, readFixedFile))

router.get('/api/entries', validatedRead(parseEntryRequest, readRawEntry))

export default router
