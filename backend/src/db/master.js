// Conexión a la BD maestra (mirestaurante_saas)
// Contiene la tabla de tenants registrados
const mysql = require('mysql2/promise')

let masterPool = null

function getMasterPool() {
  if (!masterPool) {
    masterPool = mysql.createPool({
      host:               process.env.DB_MASTER_HOST     || '127.0.0.1',
      port:               parseInt(process.env.DB_MASTER_PORT || '3308'),
      user:               process.env.DB_MASTER_USER,
      password:           process.env.DB_MASTER_PASSWORD,
      database:           process.env.DB_MASTER_NAME     || 'mirestaurante_saas',
      waitForConnections: true,
      connectionLimit:    10,
      timezone:           'America/Bogota',
    })
  }
  return masterPool
}

async function verifyMasterConnection() {
  const pool = getMasterPool()
  const [rows] = await pool.query('SELECT 1 AS ok')
  if (!rows[0]?.ok) throw new Error('BD maestra no responde')
  console.log('✅ BD maestra conectada:', process.env.DB_MASTER_NAME)
}

module.exports = { getMasterPool, verifyMasterConnection }
