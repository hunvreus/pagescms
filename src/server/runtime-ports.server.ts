export interface Clock {
  now: () => Date
}

export interface IdentifierGenerator {
  create: () => string
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
})

export const webCryptoIdentifierGenerator: IdentifierGenerator = Object.freeze({
  create: () => crypto.randomUUID(),
})
