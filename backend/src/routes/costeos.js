const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM costeos ORDER BY updated_at DESC')
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [[c]] = await req.tenantPool.query('SELECT * FROM costeos WHERE id = ?', [req.params.id])
    if (!c) return res.status(404).json({ success: false, error: { message: 'No encontrado' } })
    const [ing] = await req.tenantPool.query('SELECT * FROM costeo_ingredientes WHERE costeo_id = ?', [req.params.id])
    res.json({ success: true, data: { ...c, ingredientes: ing } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/', authMiddleware, async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { nombre, porciones, precio_venta, costo_total, ingredientes } = req.body
    const [r] = await conn.query(
      'INSERT INTO costeos (nombre, porciones, precio_venta, costo_total) VALUES (?,?,?,?)',
      [nombre, porciones || 1, precio_venta || 0, costo_total || 0]
    )
    if (Array.isArray(ingredientes)) {
      for (const ing of ingredientes) {
        await conn.query(
          'INSERT INTO costeo_ingredientes (costeo_id, nombre, cantidad, unidad, costo_unitario) VALUES (?,?,?,?,?)',
          [r.insertId, ing.nombre, ing.cantidad, ing.unidad, ing.costo_unitario]
        )
      }
    }
    await conn.commit()
    res.status(201).json({ success: true, data: { id: r.insertId } })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

router.delete('/:id', authMiddleware, soloAdmin, async (req, res) => {
  try {
    await req.tenantPool.query('DELETE FROM costeos WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
