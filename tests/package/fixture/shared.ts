import type { SharedPluginModule } from '#/package/runtime'

const shared: SharedPluginModule = (publicOptions) => ({
  fields: {
    'fixture-text': {
      definition: {
        label: String(publicOptions.label ?? 'Fixture'),
        defaultValue: '',
      },
    },
  },
})

export default shared
