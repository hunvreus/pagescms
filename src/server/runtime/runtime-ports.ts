export interface Clock {
  now: () => Date
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
})
