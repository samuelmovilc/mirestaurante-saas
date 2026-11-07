const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { trabajador, estado, fecha_inicio, fecha_fin } = req.query
    let sql = 'SELECT * FROM cartera WHERE 1=1'
    const vals = []
    if (trabajador)   { sql += ' AND trabajador_nombre LIKE ?'; vals.push(`%${trabajador}%`) }
    if (estado && estado !== 'todos') { sql += ' AND estado = ?'; vals.push(estado) }
    if (fecha_inicio) { sql += ' AND fecha_emision >= ?'; vals.push(fecha_inicio) }
    if (fecha_fin)    { sql += ' AND fecha_emision <= ?'; vals.push(fecha_fin) }
    sql += ' ORDER BY created_at DESC'
    const [rows] = await req.tenantPool.query(sql, vals)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/paz-salvo', authMiddleware, async (req, res) => {
  try {
    const { trabajador_nombre } = req.query
    const [[row]] = await req.tenantPool.query(
      'SELECT SUM(total - pagado) AS pendiente FROM cartera WHERE trabajador_nombre = ? AND estado != "pagado"',
      [trabajador_nombre]
    )
    const tieneSaldo = parseFloat(row.pendiente || 0) > 0
    res.json({ success: true, data: { paz_y_salvo: !tieneSaldo, pendiente: row.pendiente || 0 } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/:id/pagos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM cartera_pagos WHERE cartera_id = ? ORDER BY fecha_pago DESC', [req.params.id])
    const [[c]]  = await req.tenantPool.query('SELECT total, pagado FROM cartera WHERE id = ?', [req.params.id])
    res.json({ success: true, data: { pagos: rows, total: c?.total || 0, pagado: c?.pagado || 0 } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/:id/pagos', authMiddleware, soloAdmin, async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { fecha_pago, metodo_pago, referencia, monto } = req.body
    await conn.query(
      'INSERT INTO cartera_pagos (cartera_id, fecha_pago, metodo_pago, referencia, monto) VALUES (?,?,?,?,?)',
      [req.params.id, fecha_pago, metodo_pago, referencia, monto]
    )
    await conn.query('UPDATE cartera SET pagado = pagado + ? WHERE id = ?', [monto, req.params.id])
    // Actualizar estado
    await conn.query(`
      UPDATE cartera SET estado =
        CASE WHEN (pagado >= total) THEN 'pagado'
             WHEN (pagado > 0)      THEN 'parcial'
             ELSE 'pendiente' END
      WHERE id = ?
    `, [req.params.id])
    await conn.commit()
    res.status(201).json({ success: true })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

router.delete('/pagos/:pagoId', authMiddleware, soloAdmin, async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[pago]] = await conn.query('SELECT * FROM cartera_pagos WHERE id = ?', [req.params.pagoId])
    if (!pago) return res.status(404).json({ success: false, error: { message: 'Pago no encontrado' } })
    await conn.query('DELETE FROM cartera_pagos WHERE id = ?', [req.params.pagoId])
    await conn.query('UPDATE cartera SET pagado = pagado - ? WHERE id = ?', [pago.monto, pago.cartera_id])
    await conn.query(`
      UPDATE cartera SET estado =
        CASE WHEN (pagado >= total) THEN 'pagado'
             WHEN (pagado > 0)      THEN 'parcial'
             ELSE 'pendiente' END
      WHERE id = ?
    `, [pago.cartera_id])
    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

module.exports = router
