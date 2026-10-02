import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifactArgument = process.argv[2]
const forbiddenSentinels = [
  'PAGESCMS_FAKE_CLIENT_DEPLOYMENT',
  'PAGESCMS_SERVER_ONLY_SENTINEL',
  'from "@libsql/client"',
  'from "drizzle-orm/libsql"',
]

if (!artifactArgument) {
  throw new Error('Expected an artifact directory argument')
}

const artifactDirectory = isAbsolute(artifactArgument)
  ? artifactArgument
  : resolve(rootDirectory, artifactArgument)

function artifactFiles(directory) {
  if (!existsSync(directory)) {
    throw new Error(`Expected build artifact directory '${directory}' to exist`)
  }

  const files = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...artifactFiles(path))
    else files.push(path)
  }
  return files
}

const files = artifactFiles(artifactDirectory)
for (const sentinel of forbiddenSentinels) {
  const sentinelBytes = Buffer.from(sentinel)
  const leakedFile = files.find((path) =>
    readFileSync(path).includes(sentinelBytes),
  )
  if (leakedFile) {
    throw new Error(
      `Unexpected deployment sentinel '${sentinel}' in '${leakedFile}'`,
    )
  }
}
