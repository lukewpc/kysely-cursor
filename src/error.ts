export type ErrorCode = 'INVALID_TOKEN' | 'INVALID_SORT' | 'INVALID_LIMIT' | 'UNEXPECTED_ERROR'

type ErrorOpts = {
  message: string
  code: ErrorCode
  cause?: Error
}

export class PaginationError extends Error {
  code: ErrorCode

  constructor(opts: ErrorOpts) {
    super(opts.message, { cause: opts.cause })
    this.code = opts.code
  }
}
