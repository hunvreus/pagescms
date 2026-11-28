import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite } from './shared'
import { githubAppInstall } from '#/server/github/app-install'
import { parseRepositorySearch } from '#/shared/repository-search'
import { parseTemplateCopy } from '#/shared/requests/repository-template'
import { parseBranchCreate } from '#/shared/requests/branch'
import { parseRepositoryRequest } from '#/shared/requests/repository'
import {
  copyTemplate,
  dashboardData,
  listAccountRepositories,
} from '#/server/services/dashboard'
import {
  listRepositoryBranches,
  readRepository,
  createRepositoryBranch,
} from '#/server/services/repository'

const router = new Hono<ApiEnvironment>()

router.get('/api/github-app/install', (context) =>
  githubAppInstall(context.env.getServices()),
)

router.post(
  '/api/repositories',
  validatedWrite(parseTemplateCopy, copyTemplate),
)

router.post(
  '/api/branches',
  validatedWrite(parseBranchCreate, createRepositoryBranch),
)

router.get(
  '/api/repository',
  validatedRead(parseRepositoryRequest, readRepository),
)

router.get(
  '/api/branches',
  validatedRead(parseRepositoryRequest, listRepositoryBranches),
)

router.get(
  '/api/repositories',
  validatedRead((input) => {
    const query = input as Record<string, string>
    return parseRepositorySearch({
      account: {
        login: query.login,
        type: query.type,
        repositorySelection: query.repositorySelection,
        installationId: Number(query.installationId),
      },
      keyword: query.keyword,
    })
  }, listAccountRepositories),
)

router.get(
  '/api/dashboard',
  validatedRead(() => undefined, dashboardData),
)

export default router
