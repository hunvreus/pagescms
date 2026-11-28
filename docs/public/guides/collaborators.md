---
title: Invite collaborators
description: Give people access to edit content by email, without a GitHub account.
---

Collaborators edit content and media in one repository. They don't need a GitHub account or access to the repository itself. Only managers can invite them: people signed in with GitHub who have write access to the repository.

## Invite someone

1. Open the project and go to **Collaborators**.
2. Choose **Invite collaborator** and enter one or more email addresses.
3. Send the invitations.

Each person gets an email with a link to the project. They must sign in with the address that received the invitation. Access lasts until you remove it.

Before inviting your team, invite yourself at a second address and make a test edit to check what a collaborator sees.

## What collaborators can do

Collaborators can edit, create, rename and delete the content and media that `.pages.yml` exposes. They can't change the configuration, invite others, manage the cache or run actions; on hosted Pro projects, a role can allow actions. To restrict what they can do:

- Turn off create, rename or delete for specific content with [`operations`](/docs/configuration/content/#operations).
- On hosted Pro projects, assign [roles](/docs/guides/roles/) to limit them to specific branches, collections, files, media and actions.

## Remove access

In **Collaborators**, remove the person and confirm. This ends their Pages CMS access to this repository. Their past commits stay in the history.

## Who appears as the commit author

Collaborators save through the repository's GitHub App installation, so their commits come from the app by default. To record the editor's name and email on the commit, set [`commit.identity: user`](/docs/configuration/settings/#commit-identity).

## Self-hosted instances

Invitations need the GitHub App credentials and `CRYPTO_KEY`, plus a sign-in method that doesn't require GitHub, such as email codes or Google, so invited people can sign in. See [environment variables](/docs/self-hosting/environment-variables/). Collaborators are stored in the application database, not in `.pages.yml`; to move them from 2.x, see [Upgrading](/docs/self-hosting/upgrading/#2-move-collaborators).
