import { onRequest as __auth_callback_js_onRequest } from "/Users/hunvreus/Workspace/pages-cms/functions/auth/callback.js"
import { onRequest as __auth_login_js_onRequest } from "/Users/hunvreus/Workspace/pages-cms/functions/auth/login.js"
import { onRequest as __auth_revoke_js_onRequest } from "/Users/hunvreus/Workspace/pages-cms/functions/auth/revoke.js"

export const routes = [
    {
      routePath: "/auth/callback",
      mountPath: "/auth",
      method: "",
      middlewares: [],
      modules: [__auth_callback_js_onRequest],
    },
  {
      routePath: "/auth/login",
      mountPath: "/auth",
      method: "",
      middlewares: [],
      modules: [__auth_login_js_onRequest],
    },
  {
      routePath: "/auth/revoke",
      mountPath: "/auth",
      method: "",
      middlewares: [],
      modules: [__auth_revoke_js_onRequest],
    },
  ]