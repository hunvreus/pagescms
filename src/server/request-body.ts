export class RequestTooLarge extends Error {}

/** Count bytes as they arrive, including requests with missing or inaccurate lengths. */
export async function readLimitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new RequestTooLarge()
  let buffer = new Uint8Array(0)
  let size = 0
  const reader = request.body?.getReader()
  if (!reader) return buffer
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return buffer.subarray(0, size)
      const end = size + value.byteLength
      if (end > limit) {
        void reader.cancel().catch(() => {})
        throw new RequestTooLarge()
      }
      if (end > buffer.length) {
        const grown = new Uint8Array(
          Math.min(limit, Math.max(end, buffer.length * 2, 4096)),
        )
        grown.set(buffer.subarray(0, size))
        buffer = grown
      }
      buffer.set(value, size)
      size = end
    }
  } finally {
    reader.releaseLock()
  }
}
