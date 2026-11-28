import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve the package's own dependency, including nested and pnpm installations. */
export function configuredIconDirectory() {
  return dirname(
    fileURLToPath(import.meta.resolve('@hugeicons/core-free-icons/News01Icon')),
  ).replaceAll('\\', '/')
}
