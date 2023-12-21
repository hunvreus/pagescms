# Pages CMS

Pages CMS is a SPA that acts

## Stack

Pages CMS is a [Vue.js](https://vuejs.org/) app with a few serverless functions to handle the Github login. It is intended to be deployed with [Cloudflare Pages](https://pages.cloudflare.com/), using [Cloudflare Workers](https://workers.cloudflare.com/) (referred to as functions [functions](https://developers.cloudflare.com/pages/functions/)) for the serverless code.

## Run locally

1. Install all dependencies:

  ```sh
  npm install
  ```

2. [Create a new GitHub Oauth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). The callback URL should be `http://127.0.0.1:8788/auth/callback`.
3. Add a `.dev.vars` file with cliend ID and secret ID from your GitHub OAuth app:

  ```toml
  CLIENT_ID =	"2c08c4f1043c055cafd6"
  CLIENT_SECRET = "55038980deaf84c11e8879e9a94008c112a5ba69"
  CLIENT_URL = "http://127.0.0.1:8788"
  ```

4. [Run the app locally with Wrangler](https://developers.cloudflare.com/pages/functions/local-development/) (this will run the Vue app and the serverless functions):

    ````sh
    npx wrangler pages dev -- npm run dev
    ```

5. Go to http://localhost:8788

## Deploy

TBD

## TODO

- Support for upload to S3 etc 
- Support for extensions (yml, yaml, toml, json, md, markdown, html, csv...). By default we support Markdown with YAML front matter?
- Support preview_path?
- Add field validation
- Adding options
- Type AND widget?
- Add pagination for large collections
- Explore support for things outside Jekyll
- Connect to build system?
- Offer option to register with email
- Drag and drop upload to editor
- Bounce user up in the filebrowser when deleting last file of folder (empty folders are removed from Git)
- Track path in filebrowser (and support for history)
- Default filebrowser to grid?
- Can I navigate away from FB while uploading without breaking things?

search: [ title, body ]
      filter: [ published ]

      default:
        sort: date
        sort_order: desc
        filter: published
        filter_value: true
        search: 'China'


        default: |
          ### Heading

          - Bullet
          - Points
          
          This is content **markdown** and **stuff**.
// TODO: add some sort of schema check to make things are properly configured (e.g. fields are correctly formed, etc)

// TODO: Deal with collaboration and race conditions (e.g. someone updates a file while we're editing)

