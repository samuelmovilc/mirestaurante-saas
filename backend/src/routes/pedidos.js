const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const { descontar, devolverPedido } = require('../stock')
const router = express.Router()

// Leer pedidos (datos de clientes) exige sesión; crear un pedido (POST) sigue siendo público para el formulario.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { estado, fecha } = req.query
    let sql = `SELECT p.*,
               p.numero        AS numero_pedido,
               p.cliente_nombre AS nombre_cliente,
               p.tipo          AS tipo_pedido,
               MAX(m.nombre)   AS mesa_nombre,
               GROUP_CONCAT(CONCAT(pd.cantidad,'x ',pd.nombre_producto) SEPARATOR ' + ') AS detalle_resumen,
               COALESCE(SUM(pd.subtotal), 0) AS total
               FROM pedidos p
               LEFT JOIN pedido_detalle pd ON pd.pedido_id = p.id
               LEFT JOIN mesas m ON m.id = p.mesa_id
               WHERE 1=1`
    const vals = []
    if (estado && estado !== 'todos') { sql += ' AND p.estado = ?'; vals.push(estado) }
    if (fecha)  { sql += ' AND DATE(p.created_at) = ?'; vals.push(fecha) }
    sql += ' GROUP BY p.id ORDER BY p.created_at DESC'
    const [rows] = await req.tenantPool.query(sql, vals)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

// Una mesa está ocupada mientras tenga un pedido sin liquidar ni cancelar.
const ESTADOS_ACTIVOS = "('cancelado','entregado')"
async function pedidoActivoDeMesa(q, mesaId, excluirPedidoId = 0) {
  const [[ped]] = await q.query(
    `SELECT numero FROM pedidos WHERE mesa_id = ? AND estado NOT IN ${ESTADOS_ACTIVOS} AND id <> ? ORDER BY id DESC LIMIT 1`, [mesaId, excluirPedidoId])
  return ped || null
}
function errorMesaOcupada(nombreMesa, numero) {
  const e = new Error(`${nombreMesa} ya tiene el pedido #${numero} activo. No se puede tomar otro hasta que ese pedido se liquide o se cancele.`)
  e.status = 409; e.code = 'MESA_OCUPADA'; return e
}

// Público (lo usa el formulario): qué mesas están ocupadas ahora.
router.get('/mesas-ocupadas', async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query(
      `SELECT mesa_id, MAX(numero) AS numero_pedido FROM pedidos WHERE mesa_id IS NOT NULL AND estado NOT IN ${ESTADOS_ACTIVOS} GROUP BY mesa_id`)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [[p]] = await req.tenantPool.query(
      `SELECT p.*, p.numero AS numero_pedido, p.cliente_nombre AS nombre_cliente, p.tipo AS tipo_pedido, m.nombre AS mesa_nombre
       FROM pedidos p LEFT JOIN mesas m ON m.id = p.mesa_id WHERE p.id = ?`, [req.params.id])
    if (!p) return res.status(404).json({ success: false, error: { message: 'Pedido no encontrado' } })
    const [det] = await req.tenantPool.query('SELECT * FROM pedido_detalle WHERE pedido_id = ?', [req.params.id])
    const total = det.reduce((s, d) => s + Number(d.subtotal || 0), 0)
    res.json({ success: true, data: { ...p, detalle: det, total } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.post('/', async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    // Regla: no se toman pedidos con la caja cerrada.
    const [abiertos] = await conn.query('SELECT id FROM turnos_caja WHERE estado = "abierto" LIMIT 1')
    if (!abiertos.length) {
      return res.status(409).json({ success: false, error: { code: 'CAJA_CERRADA', message: 'La caja está cerrada. Pide al administrador que abra la caja para tomar pedidos.' } })
    }
    await conn.beginTransaction()
    // Acepta tanto nombre_cliente como cliente_nombre, tanto tipo_pedido como tipo
    const cliente_nombre  = req.body.cliente_nombre  || req.body.nombre_cliente
    const mesa_id         = req.body.mesa_id
    let vendedor_nombre = req.body.vendedor_nombre || null
    if (!vendedor_nombre && req.body.vendedor_id) {   // el formulario manda el id: se guarda el NOMBRE
      const [[v]] = await conn.query('SELECT nombre FROM vendedores WHERE id = ?', [req.body.vendedor_id])
      vendedor_nombre = v ? v.nombre : null
    }
    const tipo            = req.body.tipo            || req.body.tipo_pedido || 'para_llevar'
    const domicilio       = req.body.domicilio       || 0
    const observaciones   = req.body.observaciones
    const items           = req.body.items

    // Regla: una mesa con un pedido activo no admite otro. Se bloquea la fila de la mesa para que dos
    // personas que piden a la vez no ocupen la misma mesa.
    if (tipo === 'mesa') {
      if (!mesa_id) { const e = new Error('Selecciona una mesa'); e.status = 400; throw e }
      const [[mesa]] = await conn.query('SELECT id, nombre FROM mesas WHERE id = ? FOR UPDATE', [mesa_id])
      if (!mesa) { const e = new Error('La mesa seleccionada no existe'); e.status = 400; throw e }
      const activo = await pedidoActivoDeMesa(conn, mesa.id)
      if (activo) throw errorMesaOcupada(mesa.nombre, activo.numero)
    }

    // Número autoincremental transaccional
    await conn.query('UPDATE contadores SET valor = valor + 1 WHERE nombre = "pedido"')
    const [[{ valor: numero }]] = await conn.query('SELECT valor FROM contadores WHERE nombre = "pedido"')

    const [result] = await conn.query(
      'INSERT INTO pedidos (numero, cliente_nombre, mesa_id, vendedor_nombre, tipo, domicilio, observaciones) VALUES (?,?,?,?,?,?,?)',
      [numero, cliente_nombre, tipo === 'mesa' ? (mesa_id || null) : null, vendedor_nombre, tipo, domicilio, observaciones]
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
      await descontar(conn, items, pedidoId)
    }

    await conn.commit()
    res.status(201).json({ success: true, data: { id: pedidoId, numero_pedido: numero, total } })
  } catch (err) {
    await conn.rollback()
    res.status(err.status || 500).json({ success: false, error: { message: err.message, ...(err.code ? { code: err.code } : {}) } })
  } finally { conn.release() }
})

router.put('/:id', authMiddleware, async (req, res) => {
  const pool = req.tenantPool
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { items } = req.body
    // Solo se actualizan los campos que llegan. Antes, editar los productos borraba el nombre del cliente,
    // la mesa, el vendedor y el tipo (llegaban sin definir y se guardaban como vacío).
    const sets = [], vals = []
    for (const campo of ['cliente_nombre', 'mesa_id', 'vendedor_nombre', 'tipo', 'domicilio', 'observaciones']) {
      if (req.body[campo] !== undefined) { sets.push(`${campo} = ?`); vals.push(['mesa_id'].includes(campo) ? (req.body[campo] || null) : req.body[campo]) }
    }
    const [[actual]] = await conn.query('SELECT tipo, mesa_id FROM pedidos WHERE id = ? FOR UPDATE', [req.params.id])
    if (!actual) { await conn.rollback(); return res.status(404).json({ success: false, error: { message: 'Pedido no encontrado' } }) }
    const tipoFinal = req.body.tipo !== undefined ? req.body.tipo : actual.tipo
    const mesaFinal = req.body.mesa_id !== undefined ? (req.body.mesa_id || null) : actual.mesa_id
    if (tipoFinal === 'mesa' && mesaFinal && (mesaFinal !== actual.mesa_id)) {
      const [[mesa]] = await conn.query('SELECT id, nombre FROM mesas WHERE id = ? FOR UPDATE', [mesaFinal])
      if (!mesa) { const e = new Error('La mesa seleccionada no existe'); e.status = 400; throw e }
      const activo = await pedidoActivoDeMesa(conn, mesa.id, Number(req.params.id))
      if (activo) throw errorMesaOcupada(mesa.nombre, activo.numero)
    }
    if (sets.length) await conn.query(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id])
    if (Array.isArray(items)) {
      // Un pedido cancelado no tiene stock descontado; en los demás se devuelve lo anterior y se descuenta lo nuevo.
      const [[ped]] = await conn.query('SELECT estado FROM pedidos WHERE id = ?', [req.params.id])
      const activo = ped && ped.estado !== 'cancelado'
      if (activo) await devolverPedido(conn, req.params.id, 'ajuste', 'Pedido editado')
      await conn.query('DELETE FROM pedido_detalle WHERE pedido_id = ?', [req.params.id])
      for (const item of items) {
        await conn.query(
          'INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_costo) VALUES (?,?,?,?,?,?)',
          [req.params.id, item.producto_id || null, item.nombre_producto, item.cantidad, item.precio_unitario, item.precio_costo || 0]
        )
      }
      if (activo) await descontar(conn, items, Number(req.params.id), 'Pedido editado')
    }
    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    res.status(err.status || 500).json({ success: false, error: { message: err.message, ...(err.code ? { code: err.code } : {}) } })
  } finally { conn.release() }
})

router.patch('/:id/estado', authMiddleware, async (req, res) => {
  const conn = await req.tenantPool.getConnection()
  try {
    const { estado } = req.body
    const estados = ['pendiente','en_preparacion','listo','entregado','cancelado']
    if (!estados.includes(estado)) return res.status(400).json({ success: false, error: { message: 'Estado inválido' } })
    await conn.beginTransaction()
    const [[ped]] = await conn.query('SELECT estado, tipo, mesa_id FROM pedidos WHERE id = ? FOR UPDATE', [req.params.id])
    if (!ped) { await conn.rollback(); return res.status(404).json({ success: false, error: { message: 'Pedido no encontrado' } }) }
    // Reactivar un pedido cancelado de una mesa que ya tiene otro pedido activo no se permite.
    if (ped.estado === 'cancelado' && estado !== 'cancelado' && ped.tipo === 'mesa' && ped.mesa_id) {
      const [[mesa]] = await conn.query('SELECT id, nombre FROM mesas WHERE id = ? FOR UPDATE', [ped.mesa_id])
      const activo = mesa && await pedidoActivoDeMesa(conn, mesa.id, Number(req.params.id))
      if (activo) throw errorMesaOcupada(mesa.nombre, activo.numero)
    }
    // Cancelar devuelve el stock; reactivar un pedido cancelado lo vuelve a descontar.
    if (estado === 'cancelado' && ped.estado !== 'cancelado') {
      await devolverPedido(conn, req.params.id, 'devolucion', 'Pedido cancelado')
    } else if (ped.estado === 'cancelado' && estado !== 'cancelado') {
      const [det] = await conn.query('SELECT producto_id, cantidad FROM pedido_detalle WHERE pedido_id = ?', [req.params.id])
      await descontar(conn, det, Number(req.params.id), 'Pedido reactivado')
    }
    await conn.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, req.params.id])
    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    res.status(err.status || 500).json({ success: false, error: { message: err.message, ...(err.code ? { code: err.code } : {}) } })
  } finally { conn.release() }
})

module.exports = router
