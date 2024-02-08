# Pages CMS

[Pages CMS](https://pagescms.org) is an Open Source Content Management System built for static websites (Jekyll, Next.js, VuePress, Hugo, etc).

It allows you to edit your website's content directly on GitHub via a user-friendly interface.

## Documentation

For full documentation, go to [pagescms.org/docs](https://pagescms.org/docs)

## How it works

Pages CMS is built as a [Vue.js](https://vuejs.org/) app with a few serverless functions to handle the Github login.

It is intended to be deployed with [Cloudflare Pages](https://pages.cloudflare.com/), using [Cloudflare Workers](https://workers.cloudflare.com/) (referred to as functions [functions](https://developers.cloudflare.com/pages/functions/)) for the serverless code.

In a nutshell:

- The serverless functions are just facilitating the OAuth dance (and logout) between the client and GitHub. The GitHub OAuth token is actually stored in the client.
- Once logged in, the Vue app lets you select the repo (and branch) where your content may be at.
- You can configure each repo/branch by adding a `.pages.yml` that describes the content structure and related settings (e.g. media folder).
- The Vue app acts as a user-friendly interface on top of the GitHub API to manage content related files in your repo. With it you can search and filter collections, create/edit/delete entries, upload media...

## Get started

### Use online

The easiest way to get started is to use [the online version of Pages CMS](https://app.pagescms.org). You'll be able to log in with your GitHub account and get the latest version of Pages CMS.

This online version is identical to what's in this repo and as mentioned above, nothing is saved in the backend (OAuth tokens are saved on the client side).

But you can also install your own version locally or deploy it (for free) on Cloudflare following the steps below.

### Install locally

To get a local version up and running:

1. **Install dependencies**: `npm install`.
1. **Create a GitHub OAuth app**: 0n GitHub, go to [your Developer Settings](https://github.com/settings/developers) and [create a New OAuth App](https://github.com/settings/applications/new) (or alternatively create one for one of your organizations). You can use the following settings for your development environment:
    - Application name: `Pages CMS (dev)`
    - Homepage URL: `https://pagescms.org`
    - Authorization callback URL: `http://localhost:8788/auth/callback`
1. **Create a file for environment variables**: copy `.dev.vars.exmple` into `.dev.vars` and replace `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with the values you got for your GitHub OAuth app. You shouldn't have to modify `BASE_URL`.
1. **Run it**: `npm run dev`. This should [run the app locally with Wrangler](https://developers.cloudflare.com/pages/functions/local-development/) (allowing us to run the serverless functions locally).
1. **Visit [localhost:8788](http://localhost:8788)**.

### Deploy on Cloudflare

1. **Prerequisite**: you'll need a [Cloudflare](https://cloudflare.com) account (it's free). Once you have one:
1. **Create a [Cloudflare Pages](https://developers.cloudflare.com/pages/) app**:
    1. From your account dashboard, go to `Workers & Pages`, then click on `Create application` and select the `Pages` tab.
    1. From there you can connect your GitHub account and select the repo you want to deploy (assuming you've [forked pages-cms/pages-cms](https://github.com/pages-cms/pages-cms/fork)).
    1. Cloudflare will give you a public URL (e.g. https://pages-cms-123.pages.dev).
1. **Create a GitHub OAuth app**: same as for local, go to [your Developer Settings](https://github.com/settings/developers) and [create a New OAuth App](https://github.com/settings/applications/new) (or alternatively create one for one of your organizations) with the following settings:
    - **Application name**: `Pages CMS`
    - **Homepage URL**: `https://pagescms.org`
    - **Authorization callback URL**: `https://pages-cms-123.pages.dev/auth/callback` (replace `https://pages-cms-123.pages.dev` with whatever URL Cloudflare generated for you, or the custom domain you set up)
1. **Add the environment variables to Cloudflare**:
    1. Go back to your Cloudflare Pages app, click on the `Settings` tab and select `Environment variables` in the sidebar.
    1. Fill in `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with the values you got from GitHub.
    1. You will also need to set `BASE_URL` to the URL that was given to you when you create the Cloudflare Pages app (e.g.  `https://pages-cms-123.pages.dev`).
1. **Open the app link** (e.g. `https://pages-cms-123.pages.dev`).

Cloudflare has very generous free tiers and can also host your actual website. It's a great alternative to GitHub Pages, Netlify or Vercel.

## License

Everything in this repo is released under the [MIT License](LICENSE).

## TODO

- [ ] Support for 3rd party file services (AWS S3, Cloudflare R2, etc).
- [ ] Create an embeddable widget or split view with preview of the actual app/website.
- [ ] Add field validation in the editor.
- [ ] Connect to build process (Cloudflare Pages and GitHub Pages).
- [ ] Allow users to sign up with email (with no need for a GitHub account).
- [ ] Add history support for the file browser.
- [ ] Add proper MDX support
- [ ] Add configurable search index and filters.
- [ ] Allow to save search/filtering/ordering.
- [ ] Add groups of single files.
- [ ] Add support for other git services (e.g. Gitlab).
- [ ] Add onboarding wizard that assists the configuration step.
- [ ] Add YAML schema validation for `.pages.yml`.
- [ ] Add real-time feature to mitigate conflicting edits.
- [ ] Add ability to enable code switch for rich-text
- [ ] Add option to define insertable partials
- [ ] Global watch network issues (i.e. github.js?)
- [ ] Add check on extension, size and type when uploading + consider moving to composable
- [ ] add validation of file against schema (easy to break for JSON files for example)
- [ ] add support for JSON/TOML frontmatter and TOML
- [ ] Saved searches
- [ ] Sort out date (shouldn't require field)
- [ ] Prevent saving when no change happened and handle when Github API doesn't create a commit if no change
- [ ] History doesn't reload when creating a copy