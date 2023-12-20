				import worker, * as OTHER_EXPORTS from "/Users/hunvreus/Workspace/pages-cms/node_modules/wrangler/templates/pages-template-worker.ts";
				import * as __MIDDLEWARE_0__ from "/Users/hunvreus/Workspace/pages-cms/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts";
				const envWrappers = [__MIDDLEWARE_0__.wrap].filter(Boolean);
				const facade = {
					...worker,
					envWrappers,
					middleware: [
						__MIDDLEWARE_0__.default,
            ...(worker.middleware ? worker.middleware : []),
					].filter(Boolean)
				}
				export * from "/Users/hunvreus/Workspace/pages-cms/node_modules/wrangler/templates/pages-template-worker.ts";

				const maskDurableObjectDefinition = (cls) =>
					class extends cls {
						constructor(state, env) {
							let wrappedEnv = env
							for (const wrapFn of envWrappers) {
								wrappedEnv = wrapFn(wrappedEnv)
							}
							super(state, wrappedEnv);
						}
					};
				

				export default facade;