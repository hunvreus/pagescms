import shared from './shared.mjs'
export default (options) => ({
  id: 'proof',
  create: (env) => ({
    handlers: [
      {
        path: '/mcp',
        methods: ['GET'],
        handle: async () => Response.json({ plugin: 'proof' }),
      },
      {
        path: '/.well-known/pagescms-proof',
        methods: ['GET'],
        handle: async () => Response.json({ ok: true }),
      },
    ],
    routes: [
      {
        method: 'GET',
        path: 'health',
        access: 'public',
        handle: async () => {
          const field = shared().fields.proof.definition
          return Response.json({
            ok: true,
            configured: options.marker === 'PRIVATE_OPTION_SENTINEL',
            secret: Boolean(env.PROOF_SECRET),
            read: field.read('hello'),
            write: field.write('HELLO'),
            valid: field.schema().safeParse('hello').success,
          })
        },
      },
      {
        method: 'GET',
        path: 'storage',
        access: 'public',
        handle: async () => {
          const row = await env.DATABASE.prepare(
            "SELECT value FROM proof_plugin WHERE id = 'proof'",
          ).first()
          await env.PROOF_BUCKET.put('proof', 'local-r2-value')
          const object = await env.PROOF_BUCKET.get('proof')
          return Response.json({
            database: row.value,
            object: await object.text(),
          })
        },
      },
      {
        method: 'GET',
        path: 'private',
        access: 'user',
        handle: async (_request, context) =>
          Response.json({ user: context.user.id }),
      },
    ],
  }),
})
