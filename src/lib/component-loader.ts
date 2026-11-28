/** Share speculative imports with rendering, but allow retry after a failed import. */
export function componentLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    pending ??= Promise.resolve()
      .then(load)
      .catch((error: unknown) => {
        pending = undefined
        throw error
      })
    return pending
  }
}
