// CRUD genérico: categorias, mesas, vendedores, metodos_pago
const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router({ mergeParams: true })

function makeRouter(table, fields) {
  const r = express.Router()

  r.get('/', async (req, res) => {
    try {
      const [rows] = await req.tenantPool.query(`SELECT * FROM ${table} ORDER BY id ASC`)
      res.json({ success: true, data: rows })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  r.post('/', authMiddleware, soloAdmin, async (req, res) => {
    try {
      const vals = fields.map(f => req.body[f] ?? null)
      const cols = fields.join(', ')
      const phs  = fields.map(() => '?').join(', ')
      const [result] = await req.tenantPool.query(`INSERT INTO ${table} (${cols}) VALUES (${phs})`, vals)
      const [rows]   = await req.tenantPool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId])
      res.status(201).json({ success: true, data: rows[0] })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  r.put('/:id', authMiddleware, soloAdmin, async (req, res) => {
    try {
      const sets = fields.map(f => `${f} = ?`).join(', ')
      const vals = [...fields.map(f => req.body[f] ?? null), req.params.id]
      await req.tenantPool.query(`UPDATE ${table} SET ${sets} WHERE id = ?`, vals)
      res.json({ success: true })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  r.delete('/:id', authMiddleware, soloAdmin, async (req, res) => {
    try {
      await req.tenantPool.query(`UPDATE ${table} SET activo = 0 WHERE id = ?`, [req.params.id])
      res.json({ success: true })
    } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
  })

  return r
}

// Exportar routers individuales para montarlos en server.js
const categoriasRouter   = makeRouter('categorias',   ['nombre', 'orden', 'activo'])
const mesasRouter        = makeRouter('mesas',        ['nombre', 'activo'])
const vendedoresRouter   = makeRouter('vendedores',   ['nombre', 'activo'])
const metodosPagoRouter  = makeRouter('metodos_pago', ['nombre', 'tipo', 'activo'])

module.exports = { categoriasRouter, mesasRouter, vendedoresRouter, metodosPagoRouter }
