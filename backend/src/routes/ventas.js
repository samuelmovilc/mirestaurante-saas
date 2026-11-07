const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado } = req.query
    let sql = `SELECT v.*, GROUP_CONCAT(CONCAT(vmp.metodo_nombre,': $',vmp.monto) SEPARATOR ' | ') AS metodos_resumen
               FROM ventas v LEFT JOIN venta_metodos_pago vmp ON vmp.venta_id = v.id WHERE 1=1`
    const vals = []
    if (fecha_inicio) { sql += ' AND DATE(v.created_at) >= ?'; vals.push(fecha_inicio) }
    if (fecha_fin)    { sql += ' AND DATE(v.created_at) <= ?'; vals.push(fecha_fin) }
    if (estado && estado !== 'todas') { sql += ' AND v.estado = ?'; vals.push(estado) }
    sql += ' GROUP BY v.id ORDER BY v.created_at DESC'
    const [rows] = await req.tenantPool.query(sql, vals)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query
    const vals = [fecha_inicio || '2020-01-01', fecha_fin || '2099-12-31']
    const [[stats]] = await req.tenantPool.query(`
      SELECT
        COUNT(*) AS total_ventas,
        COALESCE(SUM(total), 0)         AS venta_bruta,
        COALESCE(SUM(utilidad_bruta), 0) AS utilidad_total,
        COALESCE(AVG(total), 0)         AS ticket_promedio
      FROM ventas
      WHERE estado = 'aceptada'
        AND DATE(created_at) BETWEEN ? AND ?
    `, vals)

    const [metodos] = await req.tenantPool.query(`
      SELECT vmp.metodo_nombre, vmp.tipo, SUM(vmp.monto) AS total
      FROM venta_metodos_pago vmp
      JOIN ventas v ON v.id = vmp.venta_id
      WHERE v.estado = 'aceptada' AND DATE(v.created_at) BETWEEN ? AND ?
      GROUP BY vmp.metodo_nombre, vmp.tipo
    `, vals)

    res.json({ success: true, data: { ...stats, metodos } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/', authMiddleware, async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { pedido_id, cliente_nombre, vendedor_nombre, metodos_pago, observaciones } = req.body

    // Folio
    await conn.query('UPDATE contadores SET valor = valor + 1 WHERE nombre = "venta"')
    const [[{ valor }]] = await conn.query('SELECT valor FROM contadores WHERE nombre = "venta"')
    const hoy   = new Date()
    const folio = `VENTA-${String(hoy.getFullYear()).slice(2)}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}-${String(valor).padStart(3,'0')}`

    // Total y utilidad desde detalle del pedido
    const [[sums]] = await conn.query(`
      SELECT COALESCE(SUM(subtotal), 0) AS total,
             COALESCE(SUM(cantidad * (precio_unitario - precio_costo)), 0) AS utilidad
      FROM pedido_detalle WHERE pedido_id = ?
    `, [pedido_id])

    const [[ped]] = await conn.query('SELECT domicilio FROM pedidos WHERE id = ?', [pedido_id])
    const totalFinal = parseFloat(sums.total) + parseFloat(ped?.domicilio || 0)

    const [result] = await conn.query(
      'INSERT INTO ventas (folio, numero, pedido_id, cliente_nombre, vendedor_nombre, total, utilidad_bruta, observaciones) VALUES (?,?,?,?,?,?,?,?)',
      [folio, valor, pedido_id, cliente_nombre, vendedor_nombre, totalFinal, sums.utilidad, observaciones]
    )
    const ventaId = result.insertId

    // Métodos de pago + cartera si es crédito
    if (Array.isArray(metodos_pago)) {
      for (const mp of metodos_pago) {
        await conn.query(
          'INSERT INTO venta_metodos_pago (venta_id, metodo_id, metodo_nombre, tipo, monto) VALUES (?,?,?,?,?)',
          [ventaId, mp.metodo_id || null, mp.metodo_nombre, mp.tipo, mp.monto]
        )
        // Si es crédito → cartera
        if (mp.tipo === 'credito') {
          await conn.query('UPDATE contadores SET valor = valor + 1 WHERE nombre = "pedido"')
          const [[{ valor: numC }]] = await conn.query('SELECT valor FROM contadores WHERE nombre = "pedido"')
          const numCartera = `RM-${numC}`
          await conn.query(
            'INSERT INTO cartera (numero, pedido_id, venta_id, trabajador_nombre, total, fecha_emision) VALUES (?,?,?,?,?,CURDATE())',
            [numCartera, pedido_id, ventaId, cliente_nombre, mp.monto]
          )
        }
      }
    }

    // Marcar pedido como entregado
    await conn.query('UPDATE pedidos SET estado = "entregado" WHERE id = ?', [pedido_id])

    await conn.commit()
    res.status(201).json({ success: true, data: { id: ventaId, folio } })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

router.patch('/:id/anular', authMiddleware, soloAdmin, async (req, res) => {
  try {
    await req.tenantPool.query('UPDATE ventas SET estado = "anulada" WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
