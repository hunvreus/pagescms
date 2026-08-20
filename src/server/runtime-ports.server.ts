export interface Clock {
  now: () => Date
}

export interface IdentifierGenerator {
  create: () => string
}

export interface BackgroundExecutor {
  defer: (task: Promise<unknown>) => void
}

export interface BackgroundExecutionContext {
  waitUntil: (task: Promise<unknown>) => void
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
})

export const webCryptoIdentifierGenerator: IdentifierGenerator = Object.freeze({
  create: () => crypto.randomUUID(),
})

export function createBackgroundExecutor(
  executionContext: BackgroundExecutionContext,
): BackgroundExecutor {
  return {
    defer(task) {
      executionContext.waitUntil(task)
    },
  }
}
