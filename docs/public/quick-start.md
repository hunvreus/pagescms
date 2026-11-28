---
title: Quick start
description: Connect a GitHub repository, describe its content and save your first edit.
---

You need write access to a GitHub repository. Self-hosting? [Set up your instance](/docs/self-hosting/) first and sign in to it instead.

## 1. Open your repository

1. Sign in at [app.pagescms.org](https://app.pagescms.org) with GitHub.
2. Install the GitHub App on the account or organization that owns the repository.
3. Search for the repository by name and open it. On later visits you can also pick it from your recent projects.

## 2. Describe your content

Using a coding agent such as Claude Code, Cursor or Codex? Paste this prompt in your site's repository, commit the `.pages.yml` it writes, then skip to [step 4](#4-save-and-edit):

```text
Read https://pagescms.org/docs/reference.md. Then inspect this repository, find where its content and media live, and write a .pages.yml at the root so editors can manage them in Pages CMS. Use only the fields and options documented there and keep existing files where they are. When you are done, tell me to commit .pages.yml and open https://app.pagescms.org to connect this repository.
```

Otherwise, describe it yourself.

Open one of the files you want to edit, such as a blog post:

```markdown title="content/posts/hello-world.md"
---
title: Hello world
date: 2026-03-01
cover: /uploads/hello.jpg
---

Welcome to the blog.
```

Each front matter key becomes a field, and the text below becomes `body`. Open **Configuration** in Pages CMS and describe the folder:

```yaml title=".pages.yml"
content:
  - name: posts
    label: Posts
    type: collection
    path: content/posts
    fields:
      - name: title
        type: string
      - name: date
        type: date
      - name: cover
        type: image
      - name: body
        type: rich-text
```

## 3. Tell it where media goes

Find an existing image in the repository and how your content refers to it:

| Framework                | File in the repository | In content          | `input`          | `output`      |
| ------------------------ | ---------------------- | ------------------- | ---------------- | ------------- |
| Astro, Next.js, Eleventy | `public/uploads/a.jpg` | `/uploads/a.jpg`    | `public/uploads` | `/uploads`    |
| Hugo                     | `static/images/a.jpg`  | `/images/a.jpg`     | `static/images`  | `/images`     |
| Jekyll                   | `assets/img/a.jpg`     | `/assets/img/a.jpg` | `assets/img`     | `/assets/img` |

Add it to `.pages.yml`:

```yaml
media:
  input: public/uploads
  output: /uploads
```

## 4. Save and edit

Save the configuration. Open **Posts**, check that an existing post shows the right values, then edit it and choose **Save**. The change is committed to the branch, and your site rebuilds as it does for any other push.

## Next

- [Fields](/docs/configuration/fields/): every field type.
- [Collections and files](/docs/configuration/content/): single files, groups and filenames.
- [Invite collaborators](/docs/guides/collaborators/).
