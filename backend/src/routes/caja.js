const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

async function enriquecerTurno(turno, pool) {
  if (!turno) return null
  // Calcular ingresos reales desde ventas del turno
  // Si el turno está abierto (sin fecha_cierre), traer todas las ventas desde la apertura
  let ingresosQuery, ingresosParams
  if (turno.fecha_cierre) {
    ingresosQuery = `SELECT COALESCE(SUM(total),0) AS ingresos FROM ventas WHERE estado='aceptada' AND created_at >= ? AND created_at <= ?`
    ingresosParams = [turno.fecha_apertura, turno.fecha_cierre]
  } else {
    ingresosQuery = `SELECT COALESCE(SUM(total),0) AS ingresos FROM ventas WHERE estado='aceptada' AND created_at >= ?`
    ingresosParams = [turno.fecha_apertura]
  }
  const [[{ ingresos }]] = await pool.query(ingresosQuery, ingresosParams)
  // Calcular gastos reales desde caja_gastos
  const [[{ gastos }]] = await pool.query(
    `SELECT COALESCE(SUM(monto),0) AS gastos FROM caja_gastos WHERE turno_id = ?`,
    [turno.id]
  )
  const saldo_inicial        = parseFloat(turno.base_caja || 0)
  const saldo_final_calculado = saldo_inicial + parseFloat(ingresos) - parseFloat(gastos)
  return {
    ...turno,
    saldo_inicial,
    ingresos:              parseFloat(ingresos),
    gastos:                parseFloat(gastos),
    saldo_final_calculado,
    usuario_apertura:      turno.usuario_apertura || null,
    usuario_cierre:        turno.usuario_cierre   || null,
  }
}

router.get('/turno-abierto', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM turnos_caja WHERE estado = "abierto" ORDER BY id DESC LIMIT 1')
    const turno = await enriquecerTurno(rows[0] || null, req.tenantPool)
    res.json({ success: true, data: turno })
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
    const { turno_id, descripcion, monto, categoria, metodo_pago, observacion } = req.body
    // Construir descripcion si no viene (compatibilidad)
    const desc = descripcion || `${categoria || ''}${observacion ? ' - ' + observacion : ''}` || 'Gasto'
    // Intentar insertar con columnas opcionales, fallback a solo las básicas
    try {
      const [r] = await req.tenantPool.query(
        'INSERT INTO caja_gastos (turno_id, descripcion, monto, categoria, metodo_pago) VALUES (?,?,?,?,?)',
        [turno_id, desc, parseFloat(monto) || 0, categoria || '', metodo_pago || '']
      )
      return res.status(201).json({ success: true, data: { id: r.insertId } })
    } catch (e2) {
      // Si falla (columnas no existen), usar solo las básicas
      const [r] = await req.tenantPool.query(
        'INSERT INTO caja_gastos (turno_id, descripcion, monto) VALUES (?,?,?)',
        [turno_id, desc, parseFloat(monto) || 0]
      )
      return res.status(201).json({ success: true, data: { id: r.insertId } })
    }
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.get('/historico', authMiddleware, async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM turnos_caja ORDER BY id DESC LIMIT 30')
    const enriquecidos = await Promise.all(rows.map(t => enriquecerTurno(t, req.tenantPool)))
    res.json({ success: true, data: enriquecidos })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
