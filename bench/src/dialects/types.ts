import type { Kysely } from 'kysely'
import type { PaginationDialect } from 'kysely-cursor'

import type { DialectName } from '../config.js'
import type { BenchDB, DialectHandle } from '../types.js'

export type DialectFactory = {
  name: DialectName
  /**
   * Start containers (if any), create schema + indexes, seed data, return a ready handle.
   */
  setup: (opts: { rowCount: number; hotAuthorId: number }) => Promise<DialectHandle>
}

export type SchemaBuilder = {
  createSchema: (db: Kysely<BenchDB>) => Promise<void>
  paginationDialect: PaginationDialect
}
