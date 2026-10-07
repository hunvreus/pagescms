import { describe, expect, it, vi } from 'vitest'

import {
  inviteCollaborators,
  listCollaborators,
} from './collaborator-service.server'
import { registerAtomicExecutor } from './database/core.server'

import type { Database } from './database/client.server'

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
  it('uses a targeted installation lookup without enumerating repositories', async () => {
    const database = {
      query: {
        accountTable: {
          findFirst: vi.fn().mockResolvedValue({ accessToken: 'manager' }),
        },
        collaboratorTable: { findMany: vi.fn().mockResolvedValue([]) },
      },
    } as unknown as Database
    const api = {
      getRepository: vi.fn().mockResolvedValue({ canPush: true }),
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
      branch: null,
      userId: 'user-2',
    }
    const database = {
      query: {
        accountTable: {
          findFirst: vi.fn(async () => ({ accessToken: 'ghu_manager' })),
        },
        userTable: {
          findFirst: vi.fn(async () => ({ id: 'user-2' })),
        },
        collaboratorTable: { findFirst: vi.fn(async () => null) },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => ({
            toSQL: () => ({ sql: 'insert collaborator', params: [] }),
          })),
        })),
      })),
    } as unknown as Database
    registerAtomicExecutor(database, async () => [
      { rowsAffected: 1, rows: [{ id: collaborator.id }] },
    ])
    const send = vi.fn(async () => undefined)
    const prepare = vi.fn(async () => {
      expect(database.insert).not.toHaveBeenCalled()
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
        prepare,
        githubApiFactory: () => githubApi as never,
      }),
    ).resolves.toEqual([collaborator])

    expect(prepare).toHaveBeenCalledWith(['editor@example.com'])
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'editor@example.com',
        subject: 'You were added to "pages-cms/site" on Pages CMS',
        html: expect.stringContaining('You were added to'),
      }),
    )
  })
})
