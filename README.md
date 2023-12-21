# Pages CMS

## Stack

Pages CMS is a [Vue.js](https://vuejs.org/) app with a few serverless functions to handle the Github login. It is intended to be deployed with [Cloudflare Pages](https://pages.cloudflare.com/), using [Cloudflare Workers](https://workers.cloudflare.com/) (referred to as functions [functions](https://developers.cloudflare.com/pages/functions/)) for the serverless code.

## Run locally

1. Install all dependencies:

  ```sh
  npm install
  ```

2. [Create a new GitHub Oauth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). The callback URL should be `http://127.0.0.1:8788/auth/callback`.
3.  [Run the app locally with Wrangler](https://developers.cloudflare.com/pages/functions/local-development/) (this will run the Vue app and the serverless functions):

    ````sh
    npx wrangler pages dev -- npm run dev
    ```

4. Go to http://127.0.0.1:

## Deploy



### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```


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