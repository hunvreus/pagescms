import { describe, expect, it, vi } from 'vitest'

import { inviteCollaborators } from './collaborator-service.server'

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

vi.mock('./github-api.server', () => ({ createGitHubApi: () => githubApi }))

describe('inviteCollaborators', () => {
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
          returning: vi.fn(async () => [collaborator]),
        })),
      })),
    } as unknown as Database
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
      }),
    ).resolves.toEqual([collaborator])

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
