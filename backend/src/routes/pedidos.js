const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { estado, fecha } = req.query
    let sql = `SELECT p.*,
               GROUP_CONCAT(CONCAT(pd.cantidad,'x ',pd.nombre_producto) SEPARATOR ' + ') AS detalle_resumen,
               SUM(pd.subtotal) AS subtotal_items
               FROM pedidos p
               LEFT JOIN pedido_detalle pd ON pd.pedido_id = p.id
               WHERE 1=1`
    const vals = []
    if (estado && estado !== 'todos') { sql += ' AND p.estado = ?'; vals.push(estado) }
    if (fecha)  { sql += ' AND DATE(p.created_at) = ?'; vals.push(fecha) }
    sql += ' GROUP BY p.id ORDER BY p.created_at DESC'
    const [rows] = await req.tenantPool.query(sql, vals)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/:id', async (req, res) => {
  try {
    const [[p]] = await req.tenantPool.query('SELECT * FROM pedidos WHERE id = ?', [req.params.id])
    if (!p) return res.status(404).json({ success: false, error: { message: 'Pedido no encontrado' } })
    const [det] = await req.tenantPool.query('SELECT * FROM pedido_detalle WHERE pedido_id = ?', [req.params.id])
    res.json({ success: true, data: { ...p, detalle: det } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/', async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Acepta tanto nombre_cliente como cliente_nombre, tanto tipo_pedido como tipo
    const cliente_nombre  = req.body.cliente_nombre  || req.body.nombre_cliente
    const mesa_id         = req.body.mesa_id
    const vendedor_nombre = req.body.vendedor_nombre || req.body.vendedor_id
    const tipo            = req.body.tipo            || req.body.tipo_pedido || 'para_llevar'
    const domicilio       = req.body.domicilio       || 0
    const observaciones   = req.body.observaciones
    const items           = req.body.items

    // Número autoincremental transaccional
    await conn.query('UPDATE contadores SET valor = valor + 1 WHERE nombre = "pedido"')
    const [[{ valor: numero }]] = await conn.query('SELECT valor FROM contadores WHERE nombre = "pedido"')

    const [result] = await conn.query(
      'INSERT INTO pedidos (numero, cliente_nombre, mesa_id, vendedor_nombre, tipo, domicilio, observaciones) VALUES (?,?,?,?,?,?,?)',
      [numero, cliente_nombre, mesa_id || null, vendedor_nombre, tipo, domicilio, observaciones]
    )
    const pedidoId = result.insertId

    let total = 0
    if (Array.isArray(items)) {
      for (const item of items) {
        await conn.query(
          'INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_costo) VALUES (?,?,?,?,?,?)',
          [pedidoId, item.producto_id || null, item.nombre_producto, item.cantidad, item.precio_unitario, item.precio_costo || 0]
        )
        total += (item.cantidad * item.precio_unitario)
      }
    }

    await conn.commit()
    res.status(201).json({ success: true, data: { id: pedidoId, numero_pedido: numero, total } })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

router.put('/:id', authMiddleware, async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { cliente_nombre, mesa_id, vendedor_nombre, tipo, domicilio, observaciones, items } = req.body
    await conn.query(
      'UPDATE pedidos SET cliente_nombre=?, mesa_id=?, vendedor_nombre=?, tipo=?, domicilio=?, observaciones=? WHERE id=?',
      [cliente_nombre, mesa_id || null, vendedor_nombre, tipo, domicilio || 0, observaciones, req.params.id]
    )
    if (Array.isArray(items)) {
      await conn.query('DELETE FROM pedido_detalle WHERE pedido_id = ?', [req.params.id])
      for (const item of items) {
        await conn.query(
          'INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_costo) VALUES (?,?,?,?,?,?)',
          [req.params.id, item.producto_id || null, item.nombre_producto, item.cantidad, item.precio_unitario, item.precio_costo || 0]
        )
      }
    }
    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

router.patch('/:id/estado', authMiddleware, async (req, res) => {
  try {
    const { estado } = req.body
    const estados = ['pendiente','en_preparacion','listo','entregado','cancelado']
    if (!estados.includes(estado)) return res.status(400).json({ success: false, error: { message: 'Estado inválido' } })
    await req.tenantPool.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
