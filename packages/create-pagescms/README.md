# Create Pages CMS

Run `npm create pagescms@beta` for an interactive walkthrough. It can install dependencies, run the GitHub App helper and initialize the local database; each step is optional. The generated project's `npm run setup:github-app` and `npm run migrate` commands are also available separately.

For non-interactive creation, run `npm create pagescms@beta -- my-cms --target node`. The other targets are `cloudflare`, `netlify`, and `vercel`; Netlify and Vercel are experimental. Then follow the generated README and [self-hosting guide](https://pagescms.org/docs/self-hosting/).
