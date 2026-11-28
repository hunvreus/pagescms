export class OperationAcknowledgementError extends Error {
  constructor(
    cause: unknown,
    message = 'The operation completed, but its local view could not be updated. Refresh before trying again.',
  ) {
    super(message, { cause })
    this.name = 'OperationAcknowledgementError'
  }
}
