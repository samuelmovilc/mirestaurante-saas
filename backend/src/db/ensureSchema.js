// Auto-reparación de esquema por tenant.
// Algunas bases de restaurantes se crearon con un esquema anterior y les faltan columnas
// que el código actual usa (ej: productos.visible_formulario). La primera vez que se
// atiende a un tenant tras arrancar el proceso, se agregan SOLO las columnas que falten.
// Nunca borra ni modifica datos ni columnas existentes.

const EXPECTED = {
  productos: {
    descripcion:        'TEXT NULL',
    categoria_id:       'INT NULL',
    precio_venta:       'DECIMAL(12,2) NOT NULL DEFAULT 0',
    precio_costo:       'DECIMAL(12,2) NULL DEFAULT 0',
    imagen_url:         'VARCHAR(500) NULL',
    visible_formulario: 'TINYINT(1) NULL DEFAULT 1',
    activo:             'TINYINT(1) NULL DEFAULT 1',
    created_at:         'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at:         'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  categorias: {
    orden:  'INT NULL DEFAULT 0',
    activo: 'TINYINT(1) NULL DEFAULT 1',
  },
}

const done = new Map() // dbName -> Promise

async function run(pool, dbName) {
  const tables = Object.keys(EXPECTED)
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')})`,
    tables
  )
  const have = {}
  for (const r of rows) (have[r.t] ||= new Set()).add(r.c.toLowerCase())

  for (const table of tables) {
    if (!have[table]) continue // la tabla no existe: no se toca
    for (const [col, def] of Object.entries(EXPECTED[table])) {
      if (have[table].has(col.toLowerCase())) continue
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`)
      console.log(`[ensureSchema] ${dbName}: agregada ${table}.${col}`)
    }
  }
}

// Una sola ejecución por tenant y por proceso. Si falla, se registra y se reintenta
// en la siguiente petición (no bloquea la atención del restaurante).
function ensureTenantSchema(pool, dbName) {
  if (!done.has(dbName)) {
    const p = run(pool, dbName).catch(err => {
      done.delete(dbName)
      console.error(`[ensureSchema] ${dbName}:`, err.message)
    })
    done.set(dbName, p)
  }
  return done.get(dbName)
}

module.exports = { ensureTenantSchema }
