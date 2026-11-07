// Pool de conexiones por tenant (una pool por BD de tenant)
const mysql = require('mysql2/promise')

const tenantPools = new Map()

/**
 * Devuelve (o crea) el pool de conexiones para una BD de tenant.
 * @param {string} dbName  Nombre de la BD, ej: tenancy_labrasa
 */
function getTenantPool(dbName) {
  if (tenantPools.has(dbName)) return tenantPools.get(dbName)

  const pool = mysql.createPool({
    host:               process.env.DB_MASTER_HOST     || '127.0.0.1',
    port:               parseInt(process.env.DB_MASTER_PORT || '3308'),
    user:               process.env.DB_MASTER_USER,
    password:           process.env.DB_MASTER_PASSWORD,
    database:           dbName,
    waitForConnections: true,
    connectionLimit:    5,
    timezone:           'America/Bogota',
  })

  tenantPools.set(dbName, pool)
  return pool
}

/**
 * Elimina la pool de un tenant (útil cuando se desactiva o borra).
 */
async function closeTenantPool(dbName) {
  if (tenantPools.has(dbName)) {
    await tenantPools.get(dbName).end()
    tenantPools.delete(dbName)
  }
}

module.exports = { getTenantPool, closeTenantPool }
