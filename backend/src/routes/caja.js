const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

router.get('/turno-abierto', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM turnos_caja WHERE estado = "abierto" ORDER BY id DESC LIMIT 1')
    res.json({ success: true, data: rows[0] || null })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/abrir', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { base_caja } = req.body
    const [r] = await req.tenantPool.query('INSERT INTO turnos_caja (base_caja) VALUES (?)', [base_caja || 0])
    res.status(201).json({ success: true, data: { id: r.insertId } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/cerrar', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const [[turno]] = await req.tenantPool.query('SELECT * FROM turnos_caja WHERE estado = "abierto" ORDER BY id DESC LIMIT 1')
    if (!turno) return res.status(400).json({ success: false, error: { message: 'No hay turno abierto' } })
    await req.tenantPool.query('UPDATE turnos_caja SET estado = "cerrado", fecha_cierre = NOW() WHERE id = ?', [turno.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/gastos/:turnoId', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM caja_gastos WHERE turno_id = ? ORDER BY created_at DESC', [req.params.turnoId])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/gastos', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { turno_id, descripcion, monto } = req.body
    const [r] = await req.tenantPool.query('INSERT INTO caja_gastos (turno_id, descripcion, monto) VALUES (?,?,?)', [turno_id, descripcion, monto])
    res.status(201).json({ success: true, data: { id: r.insertId } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/historico', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM turnos_caja ORDER BY id DESC LIMIT 30')
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
