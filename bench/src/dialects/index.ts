import type { DialectName } from '../config.js'
import type { DialectFactory } from './types.js'
import { mssqlFactory } from './mssql.js'
import { mysqlFactory } from './mysql.js'
import { postgresFactory } from './postgres.js'
import { sqliteFactory } from './sqlite.js'

const factories: Record<DialectName, DialectFactory> = {
  postgres: postgresFactory,
  mysql: mysqlFactory,
  mssql: mssqlFactory,
  sqlite: sqliteFactory,
}

export const getFactory = (name: DialectName): DialectFactory => factories[name]

export { factories }
