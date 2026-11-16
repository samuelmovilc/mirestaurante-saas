// CRUD genérico: categorias, mesas, vendedores, metodos_pago
const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router({ mergeParams: true })

// Un cliente antiguo (o la versión móvil de antes) mandaba "activa"; la columna real es "activo".
function normalizar(body = {}) {
  const b = { ...body }
  if (b.activo === undefined && b.activa !== undefined) b.activo = b.activa
  return b
}

// opts.refs = { tabla, col }: si algún registro de esa tabla usa este elemento, "eliminar" solo lo
// desactiva (para no perder el historial); si nadie lo usa, se borra de verdad.
function makeRouter(table, fields, opts = {}) {
  const r = express.Router()

  r.get('/', async (req, res) => {
    try {
      // ?todos=1 → devuelve todas incluyendo inactivas (para panel admin)
      // sin param → solo activas (para formulario de pedidos)
      const filtro = req.query.todos === '1' ? '' : ' WHERE activo = 1'
      const [rows] = await req.tenantPool.query(`SELECT * FROM ${table}${filtro} ORDER BY id ASC`)
      res.json({ success: true, data: rows })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  r.post('/', authMiddleware, soloAdmin, async (req, res) => {
    try {
      const b = normalizar(req.body)
      if (!String(b.nombre || '').trim()) return res.status(400).json({ success: false, error: { message: 'Nombre requerido' } })
      if (b.activo === undefined || b.activo === null || b.activo === '') b.activo = 1   // nuevo = activo por defecto
      const vals = fields.map(f => b[f] ?? null)
      const cols = fields.join(', ')
      const phs  = fields.map(() => '?').join(', ')
      const [result] = await req.tenantPool.query(`INSERT INTO ${table} (${cols}) VALUES (${phs})`, vals)
      const [rows]   = await req.tenantPool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId])
      res.status(201).json({ success: true, data: rows[0] })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  r.put('/:id', authMiddleware, soloAdmin, async (req, res) => {
    try {
      const b = normalizar(req.body)
      // Solo se actualiza lo que realmente llegó: así un campo ausente nunca se borra
      const enviados = fields.filter(f => b[f] !== undefined)
      if (!enviados.length) return res.status(400).json({ success: false, error: { message: 'Nada que actualizar' } })
      if (enviados.includes('nombre') && !String(b.nombre || '').trim()) return res.status(400).json({ success: false, error: { message: 'Nombre requerido' } })
      const sets = enviados.map(f => `${f} = ?`).join(', ')
      await req.tenantPool.query(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...enviados.map(f => b[f]), req.params.id])
      res.json({ success: true })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  r.delete('/:id', authMiddleware, soloAdmin, async (req, res) => {
    try {
      if (opts.refs) {
        const [[{ n }]] = await req.tenantPool.query(`SELECT COUNT(*) AS n FROM ${opts.refs.tabla} WHERE ${opts.refs.col} = ?`, [req.params.id])
        if (!n) {
          const [d] = await req.tenantPool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id])
          if (!d.affectedRows) return res.status(404).json({ success: false, error: { message: 'No encontrado' } })
          return res.json({ success: true, data: { eliminado: true } })
        }
        await req.tenantPool.query(`UPDATE ${table} SET activo = 0 WHERE id = ?`, [req.params.id])
        return res.json({ success: true, data: { eliminado: false, desactivado: true } })
      }
      await req.tenantPool.query(`UPDATE ${table} SET activo = 0 WHERE id = ?`, [req.params.id])
      res.json({ success: true })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  return r
}

// Exportar routers individuales para montarlos en server.js
const categoriasRouter   = makeRouter('categorias',   ['nombre', 'orden', 'activo'])
const mesasRouter        = makeRouter('mesas',        ['nombre', 'activo'], { refs: { tabla: 'pedidos', col: 'mesa_id' } })
const vendedoresRouter   = makeRouter('vendedores',   ['nombre', 'activo'])
const metodosPagoRouter  = makeRouter('metodos_pago', ['nombre', 'tipo', 'activo'])

module.exports = { categoriasRouter, mesasRouter, vendedoresRouter, metodosPagoRouter }
