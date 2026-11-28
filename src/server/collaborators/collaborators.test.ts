import type * as RepositoryIdentityModule from '#/server/access/repository-identity'
import { describe, expect, it, vi } from 'vitest'

import {
  inviteCollaborators,
  listCollaborators,
} from '../__tests__/credentials'
import { listCollaborators as listWithAccess } from './collaborators'
import { registerAtomicExecutor } from '#/server/db/core'

import type { Database } from '#/server/db/client'

const githubApi = vi.hoisted(() => ({
  getRepository: vi.fn(async () => ({
    id: 10,
    owner: 'pages-cms',
    ownerId: 20,
    repo: 'site',
    defaultBranch: 'main',
    private: true,
    canPush: true,
  })),
  listInstallations: vi.fn(async () => [
    {
      id: 30,
      repositorySelection: 'all' as const,
      account: { login: 'pages-cms', type: 'Organization' as const },
    },
  ]),
  listInstallationRepositories: vi.fn(async () => [
    {
      owner: 'pages-cms',
      name: 'site',
      private: true,
      defaultBranch: 'main',
      updatedAt: '2026-09-02T00:00:00Z',
      canPush: true,
    },
  ]),
}))

describe('inviteCollaborators', () => {
  it('requires the direct installation lookup when app credentials are missing', async () => {
    const listInstallations = vi.fn()
    const listInstallationRepositories = vi.fn()
    const access = {
      resolve: vi.fn().mockResolvedValue({
        api: { listInstallations, listInstallationRepositories },
        tokenSource: 'user',
        repository: { id: 10, canPush: true },
      }),
    }
    await expect(
      listWithAccess(
        {} as Database,
        {
          id: 'manager',
          email: 'manager@example.com',
          githubUsername: 'manager',
        },
        'pages-cms',
        'site',
        access as never,
      ),
    ).rejects.toMatchObject({ status: 503 })
    expect(listInstallations).not.toHaveBeenCalled()
    expect(listInstallationRepositories).not.toHaveBeenCalled()
  })
  it('uses a targeted installation lookup without enumerating repositories', async () => {
    const database = {
      query: {
        accountTable: {
          findFirst: vi.fn().mockResolvedValue({ accessToken: 'manager' }),
        },
      },
      $client: { execute: vi.fn(async () => ({ rows: [] })) },
    } as unknown as Database
    const api = {
      getRepository: vi.fn().mockResolvedValue({ id: 10, canPush: true }),
      listInstallations: vi.fn(),
      listInstallationRepositories: vi.fn(),
    }
    const lookup = vi.fn().mockResolvedValue({
      id: 30,
      account: { login: 'pages-cms', type: 'Organization' },
    })
    await listCollaborators(
      database,
      {
        id: 'manager',
        name: 'Manager',
        email: 'manager@example.com',
        githubUsername: 'manager',
      },
      'pages-cms',
      'site',
      () => api as never,
      lookup,
    )
    expect(lookup).toHaveBeenCalledWith('pages-cms', 'site')
    expect(api.listInstallations).not.toHaveBeenCalled()
    expect(api.listInstallationRepositories).not.toHaveBeenCalled()
    api.getRepository.mockResolvedValueOnce({ canPush: false })
    await expect(
      listCollaborators(
        database,
        {
          id: 'manager',
          name: 'Manager',
          email: 'manager@example.com',
          githubUsername: 'manager',
        },
        'pages-cms',
        'site',
        () => api as never,
        lookup,
      ),
    ).rejects.toThrow('write access')
    expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('sends the existing-user notification through its branded template', async () => {
    const collaborator = {
      id: 40,
      email: 'editor@example.com',
      name: 'Editor Name',
      image: null,
      userId: 'user-2',
      inviteExpiresAt: null,
    }
    const database = {
      $client: {
        execute: vi.fn(async (statement: { sql: string }) => ({
          rows: statement.sql.includes('FROM user')
            ? [{ id: 'user-2', name: '', image: null, language: null }]
            : [],
        })),
      },
      query: {
        accountTable: {
          findFirst: vi.fn(async () => ({ accessToken: 'ghu_manager' })),
        },
        userTable: {
          findFirst: vi.fn(async () => ({ id: 'user-2' })),
        },
        collaboratorTable: { findFirst: vi.fn(async () => null) },
      },
    } as unknown as Database
    const execute = vi.fn(async () => [
      { rowsAffected: 1, rows: [{ id: collaborator.id }] },
    ])
    registerAtomicExecutor(database, execute)
    const send = vi.fn(async () => undefined)
    const afterCreate = vi.fn(async () => {
      expect(execute).toHaveBeenCalledOnce()
      expect(send).not.toHaveBeenCalled()
    })

    await expect(
      inviteCollaborators({
        database,
        emailProvider: { send },
        baseUrl: 'https://cms.example.com',
        user: {
          id: 'user-1',
          email: 'owner@example.com',
          name: 'Repository Owner',
          githubUsername: 'owner',
        },
        owner: 'pages-cms',
        repo: 'site',
        emails: ['editor@example.com'],
        names: { 'editor@example.com': 'Editor Name' },
        afterCreate,
        githubApiFactory: () => githubApi as never,
      }),
    ).resolves.toEqual([collaborator])

    expect(afterCreate).toHaveBeenCalledWith({
      id: collaborator.id,
      email: 'editor@example.com',
      userId: 'user-2',
    })
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'editor@example.com',
        subject: 'You were added to "pages-cms/site"',
        html: expect.stringContaining('You were added to'),
      }),
    )
  })
  it('deletes the new membership and sends nothing when afterCreate fails', async () => {
    const database = {
      $client: {
        execute: vi.fn(async (statement: { sql: string }) => ({
          rows: statement.sql.includes('FROM user')
            ? [{ id: 'user-2', name: '', image: null, language: null }]
            : [],
        })),
      },
      query: {
        accountTable: {
          findFirst: vi.fn(async () => ({ accessToken: 'ghu_manager' })),
        },
        userTable: { findFirst: vi.fn(async () => ({ id: 'user-2' })) },
        collaboratorTable: { findFirst: vi.fn(async () => null) },
      },
    } as unknown as Database
    let membershipExists = false
    registerAtomicExecutor(database, async (statements) => {
      if (statements[0].sql.startsWith('INSERT')) membershipExists = true
      if (statements[0].sql.startsWith('DELETE')) membershipExists = false
      return [{ rowsAffected: 1, rows: [{ id: 41 }] }]
    })
    const send = vi.fn(async () => undefined)

    await expect(
      inviteCollaborators({
        database,
        emailProvider: { send },
        baseUrl: 'https://cms.example.com',
        user: {
          id: 'user-1',
          email: 'owner@example.com',
          name: 'Repository Owner',
          githubUsername: 'owner',
        },
        owner: 'pages-cms',
        repo: 'site',
        emails: ['editor@example.com'],
        afterCreate: async () => {
          throw new Error('grant failed')
        },
        githubApiFactory: () => githubApi as never,
      }),
    ).rejects.toThrow('grant failed')

    expect(membershipExists).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})

vi.mock('#/server/access/repository-identity', async (original) => ({
  ...(await original<typeof RepositoryIdentityModule>()),
  findRepositoryIdentityById: async () => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
  }),
  findRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  ensureRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  observeRepositoryIdentity: async () => ({ id: 1 }),
}))
