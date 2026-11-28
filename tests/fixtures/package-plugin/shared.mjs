export default () => ({
  fields: {
    proof: {
      definition: {
        label: 'Package proof',
        defaultValue: 'proof-default',
        read: (value) => String(value ?? '').toUpperCase(),
        write: (value) => String(value ?? '').toLowerCase(),
        schema: () => ({
          safeParse: (value) => ({
            success: typeof value === 'string',
            data: value,
          }),
        }),
      },
    },
  },
})
