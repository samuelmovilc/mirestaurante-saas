// Control de inventario por producto.
// Solo afecta a los productos con controla_stock = 1; los demás se venden sin límite, como siempre.
// Todo se hace dentro de la transacción del pedido (conn), con el producto bloqueado (FOR UPDATE),
// para que dos pedidos simultáneos no vendan la misma última unidad.

function errorStock(mensaje) {
  const e = new Error(mensaje)
  e.status = 409
  return e
}

async function registrar(conn, { producto_id, tipo, cantidad, stock_resultante, pedido_id = null, nota = null, usuario = null }) {
  await conn.query(
    'INSERT INTO stock_movimientos (producto_id, tipo, cantidad, stock_resultante, pedido_id, nota, usuario) VALUES (?,?,?,?,?,?,?)',
    [producto_id, tipo, cantidad, stock_resultante, pedido_id, nota, usuario]
  )
}

// Suma las cantidades por producto (el mismo producto puede venir en varias líneas).
function agrupar(items) {
  const m = new Map()
  for (const it of items || []) {
    const id = Number(it.producto_id)
    const cant = Number(it.cantidad)
    if (!id || !(cant > 0)) continue
    m.set(id, (m.get(id) || 0) + cant)
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]) // orden fijo: evita bloqueos cruzados
}

// Descuenta del stock lo que se vende. Si no alcanza, lanza error 409 y el pedido no se guarda.
async function descontar(conn, items, pedidoId, nota = null) {
  for (const [id, cant] of agrupar(items)) {
    const [[p]] = await conn.query('SELECT id, nombre, controla_stock, stock FROM productos WHERE id = ? FOR UPDATE', [id])
    if (!p || !p.controla_stock) continue
    if (p.stock < cant) {
      throw errorStock(p.stock > 0
        ? `Stock insuficiente de "${p.nombre}": quedan ${p.stock} y pediste ${cant}`
        : `"${p.nombre}" está agotado`)
    }
    const nuevo = p.stock - cant
    await conn.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevo, id])
    await registrar(conn, { producto_id: id, tipo: 'venta', cantidad: -cant, stock_resultante: nuevo, pedido_id: pedidoId, nota })
  }
}

// Devuelve al stock lo que ese pedido había descontado (cancelación o edición).
// Se calcula desde los movimientos, así un pedido hecho antes de activar el control no suma unidades de más.
async function devolverPedido(conn, pedidoId, tipo, nota = null) {
  const [netos] = await conn.query(
    'SELECT producto_id, SUM(cantidad) AS neto FROM stock_movimientos WHERE pedido_id = ? GROUP BY producto_id ORDER BY producto_id',
    [pedidoId]
  )
  for (const n of netos) {
    const devolver = -Number(n.neto)
    if (!(devolver > 0)) continue
    const [[p]] = await conn.query('SELECT id, controla_stock, stock FROM productos WHERE id = ? FOR UPDATE', [n.producto_id])
    if (!p) continue
    const nuevo = p.stock + devolver
    await conn.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevo, p.id])
    await registrar(conn, { producto_id: p.id, tipo, cantidad: devolver, stock_resultante: nuevo, pedido_id: pedidoId, nota })
  }
}

module.exports = { descontar, devolverPedido, registrar }
