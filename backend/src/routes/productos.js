const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { categoria_id, activo } = req.query
    let sql = `SELECT p.*, c.nombre AS categoria_nombre
               FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1`
    const vals = []
    if (categoria_id) { sql += ' AND p.categoria_id = ?'; vals.push(categoria_id) }
    if (activo !== undefined) { sql += ' AND p.activo = ?'; vals.push(activo) }
    sql += ' ORDER BY c.orden ASC, p.nombre ASC'
    const [rows] = await req.tenantPool.query(sql, vals)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { nombre, descripcion, categoria_id, precio_venta, precio_costo, imagen_url } = req.body
    const [r] = await req.tenantPool.query(
      'INSERT INTO productos (nombre, descripcion, categoria_id, precio_venta, precio_costo, imagen_url) VALUES (?,?,?,?,?,?)',
      [nombre, descripcion, categoria_id, precio_venta, precio_costo || 0, imagen_url]
    )
    const [rows] = await req.tenantPool.query('SELECT * FROM productos WHERE id = ?', [r.insertId])
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.put('/:id', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { nombre, descripcion, categoria_id, precio_venta, precio_costo, imagen_url, activo } = req.body
    await req.tenantPool.query(
      'UPDATE productos SET nombre=?, descripcion=?, categoria_id=?, precio_venta=?, precio_costo=?, imagen_url=?, activo=? WHERE id=?',
      [nombre, descripcion, categoria_id, precio_venta, precio_costo || 0, imagen_url, activo ?? 1, req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.delete('/:id', authMiddleware, soloAdmin, async (req, res) => {
  try {
    await req.tenantPool.query('UPDATE productos SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/importar', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { productos } = req.body
    if (!Array.isArray(productos) || !productos.length) {
      return res.status(400).json({ success: false, error: { message: 'Lista vacía' } })
    }
    let ok = 0
    for (const p of productos) {
      if (!p.nombre || !p.precio_venta) continue
      await req.tenantPool.query(
        'INSERT INTO productos (nombre, descripcion, categoria_id, precio_venta, precio_costo) VALUES (?,?,?,?,?)',
        [p.nombre, p.descripcion || null, p.categoria_id || null, p.precio_venta, p.precio_costo || 0]
      )
      ok++
    }
    res.json({ success: true, data: { importados: ok } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
