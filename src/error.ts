export class PaginationError extends Error {
  constructor(message: string, options: { cause?: Error } = {}) {
    super(message, options)
  }
}
