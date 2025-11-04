import { base64UrlCodec } from './codec/base64Url.js'
import { codecPipe } from './codec/codec.js'
import { superJsonCodec } from './codec/superJson.js'
import { decodeCursor, resolveEdges, resolvePageTokens, sortSignature } from './cursor.js'
import { PaginationError } from './error.js'
import type { SortSet } from './sorting.js'
import { applyDefaultDirection } from './sorting.js'
import type { PaginateArgs, PaginatedResult, PaginatedResultWithEdges, Paginator, PaginatorOptions } from './types.js'

const DEFAULT_CURSOR_CODEC = codecPipe(superJsonCodec, base64UrlCodec)

export const createPaginator = (opts: PaginatorOptions): Paginator => ({
  paginate: (args) => paginate({ ...args, ...opts }),
  paginateWithEdges: (args) => paginateWithEdges({ ...args, ...opts }),
})

export const paginate = async <DB, TB extends keyof DB, O, S extends SortSet<DB, TB, O>>({
  query,
  sorts,
  limit,
  cursor,
  dialect,
  cursorCodec = DEFAULT_CURSOR_CODEC,
}: PaginateArgs<DB, TB, O, S> & PaginatorOptions): Promise<PaginatedResult<O>> => {
  assertLimitSorts(limit, sorts)

  try {
    const decodedCursor = cursor ? await decodeCursor(cursor, cursorCodec) : null
    const sortsApplied = decodedCursor?.type === 'prev' ? invertSorts(sorts) : sorts

    let q = dialect.applySort(query, sortsApplied)
    q = dialect.applyLimit(q, limit + 1, decodedCursor?.type)

    if (decodedCursor) {
      if (decodedCursor.type === 'offset') {
        q = dialect.applyOffset(q, decodedCursor.offset)
      } else {
        const sig = sortSignature(sorts)
        if (decodedCursor.payload.sig !== sig)
          throw new PaginationError({ message: 'Page token does not match sort order', code: 'INVALID_TOKEN' })

        q = dialect.applyCursor(q, sortsApplied, decodedCursor)
      }
    }

    const rows = await q.execute()

    const items = decodedCursor?.type === 'prev' ? rows.slice(0, limit).reverse() : rows.slice(0, limit)

    const { startCursor, endCursor, prevPage, nextPage } = await resolvePageTokens(
      items,
      sorts,
      cursorCodec,
      decodedCursor,
      rows.length > limit
    )

    return {
      items,
      prevPage,
      nextPage,
      startCursor,
      endCursor,
      hasPrevPage: !!prevPage,
      hasNextPage: !!nextPage,
    }
  } catch (error) {
    if (error instanceof PaginationError) throw error
    throw new PaginationError({ message: 'Failed to paginate', cause: error as Error, code: 'UNEXPECTED_ERROR' })
  }
}

export const paginateWithEdges = async <DB, TB extends keyof DB, O, S extends SortSet<DB, TB, O>>(args: PaginateArgs<DB, TB, O, S> & PaginatorOptions): Promise<PaginatedResultWithEdges<O>> => {
  const { sorts, cursorCodec = DEFAULT_CURSOR_CODEC, } = args
  const { items, ...paginated } = await paginate(args)

  try {
    const edges = await resolveEdges(
      items,
      sorts,
      cursorCodec
    )

    return {
      ...paginated,
      edges
    }
  } catch (error) {
    if (error instanceof PaginationError) throw error
    throw new PaginationError({ message: 'Failed to generate edges', cause: error as Error, code: 'UNEXPECTED_ERROR' })
  }
}

const assertLimitSorts = (limit: number, sorts: readonly unknown[]) => {
  if (!(Number.isInteger(limit) && limit > 0))
    throw new PaginationError({ message: 'Invalid page size limit', code: 'INVALID_LIMIT' })
  if (!Array.isArray(sorts) || sorts.length < 1)
    throw new PaginationError({ message: 'Cannot paginate without sorting', code: 'INVALID_SORT' })
}

const invertSorts = <S extends SortSet<any, any, any>>(sorts: S): S =>
  sorts.map((s) => ({
    ...s,
    dir: applyDefaultDirection(s.dir) === 'desc' ? 'asc' : 'desc',
  })) as unknown as S
