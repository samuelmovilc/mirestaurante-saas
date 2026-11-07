const express = require('express')
const { authMiddleware, soloAdmin } = require('../middleware/auth')
const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const [rows] = await req.tenantPool.query('SELECT * FROM configuracion WHERE id = 1 LIMIT 1')
    res.json({ success: true, data: rows[0] || {} })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.put('/', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { nombre_negocio, nit, telefono, ciudad, direccion, imprimir_auto, mostrar_costos } = req.body
    await req.tenantPool.query(`
      INSERT INTO configuracion (id, nombre_negocio, nit, telefono, ciudad, direccion, imprimir_auto, mostrar_costos)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nombre_negocio=VALUES(nombre_negocio), nit=VALUES(nit), telefono=VALUES(telefono),
        ciudad=VALUES(ciudad), direccion=VALUES(direccion),
        imprimir_auto=VALUES(imprimir_auto), mostrar_costos=VALUES(mostrar_costos)
    `, [nombre_negocio, nit, telefono, ciudad, direccion, imprimir_auto ? 1 : 0, mostrar_costos ? 1 : 0])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.put('/logo', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const { logo_url } = req.body
    await req.tenantPool.query('UPDATE configuracion SET logo_url = ? WHERE id = 1', [logo_url])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

router.delete('/logo', authMiddleware, soloAdmin, async (req, res) => {
  try {
    await req.tenantPool.query('UPDATE configuracion SET logo_url = NULL WHERE id = 1')
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = router
