const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const { registrar } = require('../stock')
const router = express.Router()

const ent = v => Math.max(0, Math.trunc(Number(v) || 0))

router.get('/', async (req, res) => {
  try {
    const { categoria_id, activo } = req.query
    // vendidos = unidades en pedidos no cancelados
    let sql = `SELECT p.*, c.nombre AS categoria_nombre, COALESCE(v.vendidos, 0) AS vendidos
               FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id
               LEFT JOIN (SELECT pd.producto_id, SUM(pd.cantidad) AS vendidos
                            FROM pedido_detalle pd JOIN pedidos pe ON pe.id = pd.pedido_id
                           WHERE pe.estado <> 'cancelado' AND pd.producto_id IS NOT NULL
                           GROUP BY pd.producto_id) v ON v.producto_id = p.id
               WHERE 1=1`
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
    const { nombre, descripcion, categoria_id, precio_venta, precio_costo, imagen_url, visible_formulario } = req.body
    const controla = req.body.controla_stock ? 1 : 0
    const stockInicial = controla ? ent(req.body.stock) : 0
    const [r] = await req.tenantPool.query(
      'INSERT INTO productos (nombre, descripcion, categoria_id, precio_venta, precio_costo, imagen_url, visible_formulario, controla_stock, stock, stock_minimo) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [nombre, descripcion, categoria_id, precio_venta, precio_costo || 0, imagen_url, visible_formulario ?? 1, controla, stockInicial, ent(req.body.stock_minimo)]
    )
    if (controla && stockInicial > 0) {
      await registrar(req.tenantPool, { producto_id: r.insertId, tipo: 'inicial', cantidad: stockInicial, stock_resultante: stockInicial, nota: 'Stock inicial', usuario: req.usuario?.nombre || null })
    }
    const [rows] = await req.tenantPool.query('SELECT * FROM productos WHERE id = ?', [r.insertId])
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.put('/:id', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { nombre, descripcion, categoria_id, precio_venta, precio_costo, imagen_url, visible_formulario, activo } = req.body
    await req.tenantPool.query(
      'UPDATE productos SET nombre=?, descripcion=?, categoria_id=?, precio_venta=?, precio_costo=?, imagen_url=?, visible_formulario=?, activo=? WHERE id=?',
      [nombre, descripcion, categoria_id, precio_venta, precio_costo || 0, imagen_url, visible_formulario ?? 1, activo ?? 1, req.params.id]
    )
    // El control de inventario solo cambia si el formulario lo envía (el stock en sí se cambia con "Ajustar stock").
    if (req.body.controla_stock !== undefined) {
      await req.tenantPool.query('UPDATE productos SET controla_stock = ? WHERE id = ?', [req.body.controla_stock ? 1 : 0, req.params.id])
    }
    if (req.body.stock_minimo !== undefined) {
      await req.tenantPool.query('UPDATE productos SET stock_minimo = ? WHERE id = ?', [ent(req.body.stock_minimo), req.params.id])
    }
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

// Ajuste manual de inventario: entrada (compra), salida (merma/consumo) o conteo (fija la cantidad real).
router.post('/:id/stock', authMiddleware, soloAdmin, async (req, res) => {
  const conn = await req.tenantPool.getConnection()
  try {
    const tipo = String(req.body.tipo || '')
    const cant = Math.trunc(Number(req.body.cantidad))
    if (!['entrada', 'salida', 'conteo'].includes(tipo)) return res.status(400).json({ success: false, error: { message: 'Tipo de ajuste inválido' } })
    if (!Number.isFinite(cant) || cant < 0 || (tipo !== 'conteo' && cant === 0)) {
      return res.status(400).json({ success: false, error: { message: 'Ingresa una cantidad válida' } })
    }
    await conn.beginTransaction()
    const [[p]] = await conn.query('SELECT id, nombre, controla_stock, stock FROM productos WHERE id = ? FOR UPDATE', [req.params.id])
    if (!p) { await conn.rollback(); return res.status(404).json({ success: false, error: { message: 'Producto no encontrado' } }) }
    if (!p.controla_stock) { await conn.rollback(); return res.status(400).json({ success: false, error: { message: 'Activa "Controlar stock" en este producto primero' } }) }
    let nuevo = tipo === 'entrada' ? p.stock + cant : tipo === 'salida' ? p.stock - cant : cant
    if (nuevo < 0) { await conn.rollback(); return res.status(400).json({ success: false, error: { message: `No puedes sacar ${cant}: solo hay ${p.stock}` } }) }
    await conn.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevo, p.id])
    await registrar(conn, { producto_id: p.id, tipo, cantidad: nuevo - p.stock, stock_resultante: nuevo, nota: (req.body.nota || '').toString().slice(0, 255) || null, usuario: req.usuario?.nombre || null })
    await conn.commit()
    res.json({ success: true, data: { stock: nuevo } })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ success: false, error: { message: err.message } })
  } finally { conn.release() }
})

router.get('/:id/movimientos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query(
      `SELECT m.*, pe.numero AS pedido_numero FROM stock_movimientos m
         LEFT JOIN pedidos pe ON pe.id = m.pedido_id
        WHERE m.producto_id = ? ORDER BY m.id DESC LIMIT 30`, [req.params.id])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.delete('/:id', authMiddleware, soloAdmin, async (req, res) => {
  try {
    // Borrado real. Las ventas/pedidos guardan el nombre del producto, así que el historial no se pierde.
    try {
      const [r] = await req.tenantPool.query('DELETE FROM productos WHERE id = ?', [req.params.id])
      if (!r.affectedRows) return res.status(404).json({ success: false, error: { message: 'Producto no encontrado' } })
      return res.json({ success: true, data: { eliminado: true } })
    } catch (e) {
      // Si algún registro lo referencia (esquema antiguo sin ON DELETE SET NULL), se desactiva en lugar de borrar
      if (e.errno === 1451 || e.code === 'ER_ROW_IS_REFERENCED_2') {
        await req.tenantPool.query('UPDATE productos SET activo = 0 WHERE id = ?', [req.params.id])
        return res.json({ success: true, data: { eliminado: false, desactivado: true } })
      }
      throw e
    }
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
