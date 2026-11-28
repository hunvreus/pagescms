---
title: Actions
description: Add buttons that run GitHub Actions workflows, such as a deploy, from Pages CMS.
---

Actions are buttons that start a GitHub Actions workflow. Use them to deploy the site, rebuild a page, optimize images or anything else you've automated. Your workflow does the work; Pages CMS starts it, passes it context and tracks the run.

## Add a deploy button

**1. Create the workflow.** It must accept a `payload` input:

```yaml title=".github/workflows/deploy.yml"
name: Deploy
on:
  workflow_dispatch:
    inputs:
      payload:
        description: Pages CMS context as JSON
        required: true
        type: string
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Run your deploy command here"
```

**2. Add the button** to `.pages.yml`:

```yaml
actions:
  - name: deploy
    label: Deploy site
    workflow: deploy.yml
```

**3. Try it.** Choose **Deploy site** in the sidebar, confirm, and watch the run in **Actions**.

## Where buttons appear

Where you define an action decides where its button shows up and what it acts on:

| Defined under               | Button appears                           | `scope`                               |
| --------------------------- | ---------------------------------------- | ------------------------------------- |
| Root `actions`              | Sidebar, or Overview quick links         | `sidebar` (default) or `overview`     |
| A collection's `actions`    | On the collection list, or on each entry | **Required:** `collection` or `entry` |
| A file's `actions`          | On the file                              | Not allowed                           |
| A media library's `actions` | On the library                           | Not allowed                           |

For example, add this action to a collection in `.pages.yml` to show a button on each entry:

```yaml
content:
  - name: posts
    type: collection
    path: content/posts
    actions:
      - name: preview
        label: Preview
        workflow: preview.yml
        scope: entry
```

## Keys

| Key          | Description                                                                            |
| ------------ | -------------------------------------------------------------------------------------- |
| `name`       | **Required.** Unique ID: letters, numbers, `-` and `_`.                                |
| `label`      | **Required.** Button text.                                                             |
| `workflow`   | **Required.** Workflow filename in `.github/workflows/`.                               |
| `ref`        | Branch or tag to run the workflow from. Defaults to the branch open in Pages CMS.      |
| `scope`      | Placement or context; see [above](#where-buttons-appear).                              |
| `confirm`    | `false` to skip confirmation, or `{ title, message, button }` to customize the dialog. |
| `fields`     | Inputs to ask for before running; see below.                                           |
| `cancelable` | `false` to prevent cancelling runs from Pages CMS. Default `true`.                     |

## Ask for inputs

`fields` adds a form to the confirmation dialog. Values arrive in `payload.inputs`.

```yaml
actions:
  - name: deploy
    label: Deploy
    workflow: deploy.yml
    fields:
      - name: environment
        label: Environment
        type: select
        required: true
        default: staging
        options:
          - { label: Staging, value: staging }
          - { label: Production, value: production }
      - name: clear_cache
        label: Clear CDN cache
        type: checkbox
```

| Field key  | Description                                                         |
| ---------- | ------------------------------------------------------------------- |
| `name`     | **Required.** Key in `payload.inputs`.                              |
| `label`    | **Required.** Label in the form.                                    |
| `type`     | **Required.** `text`, `textarea`, `number`, `checkbox` or `select`. |
| `required` | Whether a value is required.                                        |
| `default`  | Initial value.                                                      |
| `options`  | **Required for `select`.** A list of `{ label, value }`.            |

When an action has fields, the dialog is shown even with `confirm: false`.

## The payload

Your workflow receives one JSON string in `inputs.payload`:

```json
{
  "source": "pages-cms",
  "action": { "name": "deploy", "label": "Deploy", "cancelable": true },
  "repository": {
    "owner": "acme",
    "repo": "website",
    "ref": "main",
    "workflowRef": "main",
    "sha": "abc123…"
  },
  "triggeredAt": "2026-03-30T12:00:00.000Z",
  "triggeredBy": {
    "userId": "…",
    "name": "Sam Lee",
    "email": "sam@example.com",
    "githubUsername": "samlee"
  },
  "context": {
    "type": "entry",
    "name": "posts",
    "path": "content/posts/hello.md"
  },
  "inputs": { "environment": "staging", "clear_cache": true }
}
```

`context` describes where the action was run from: the repository, a collection, an entry, a file or a media library. Reruns also include `"triggerType": "rerun"` and `rerunOfActionRunId`. Read values with `fromJSON`:

```yaml
- run: ./deploy.sh "$ENVIRONMENT"
  env:
    ENVIRONMENT: ${{ fromJSON(inputs.payload).inputs.environment }}
```

Treat payload values as user input. Pass them through `env` as above rather than interpolating them directly into shell commands.

## Who can run actions

Managers can run, cancel and rerun actions. Collaborators can't, unless they're on a hosted Pro project and their [role](/docs/guides/roles/) grants it; even then they can cancel only their own runs.

GitHub Actions must be enabled on the repository.
