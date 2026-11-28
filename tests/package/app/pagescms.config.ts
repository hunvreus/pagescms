import { defineConfig } from 'pagescms'
import { smtp } from 'pagescms/plugins/smtp'
import proof from 'pagescms-proof-plugin'
import local from './plugins/local.ts'

export default defineConfig({
  target: 'node',
  plugins: [smtp(), proof({ marker: 'PRIVATE_OPTION_SENTINEL' }), local()],
})
