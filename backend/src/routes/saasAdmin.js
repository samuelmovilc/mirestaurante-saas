// Rutas del panel SaaS superadmin
// POST /api/saas/login
// GET  /api/saas/tenants
// POST /api/saas/tenants
// PUT  /api/saas/tenants/:id
// PATCH /api/saas/tenants/:id/toggle
const express  = require('express')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const { getMasterPool } = require('../db/master')
const { getTenantPool } = require('../db/tenant')
const { saasAdminAuth } = require('../middleware/auth')
const { createTenantDB } = require('../scripts/createTenantDB')

const router = express.Router()

// POST /api/saas/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body
    if (!password) return res.status(400).json({ success: false, error: { code: 'MISSING_PASSWORD', message: 'Password requerido' } })

    const ok = await bcrypt.compare(password, process.env.SAAS_ADMIN_HASH)
    if (!ok) return res.status(401).json({ success: false, error: { code: 'WRONG_PASSWORD', message: 'Password incorrecto' } })

    const token = jwt.sign({ role: 'saas_admin' }, process.env.SAAS_ADMIN_SECRET, { expiresIn: '12h' })
    res.json({ success: true, data: { token } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/saas/tenants
router.get('/tenants', saasAdminAuth, async (req, res) => {
  try {
    const pool = getMasterPool()
    const [rows] = await pool.query(`
      SELECT id, nombre_negocio, slug, db_name, usuario_login, correo, telefono,
             fecha_inicio_licencia, fecha_fin_licencia, modulos, activo, observaciones,
             created_at
      FROM tenants
      ORDER BY id DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// POST /api/saas/tenants — crear nuevo tenant
router.post('/tenants', saasAdminAuth, async (req, res) => {
  const pool = getMasterPool()
  try {
    const {
      nombre_negocio, slug, usuario_login, password,
      correo, telefono, fecha_inicio_licencia, fecha_fin_licencia,
      modulos, observaciones
    } = req.body

    if (!nombre_negocio || !slug || !usuario_login || !password) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Faltan campos obligatorios' } })
    }

    // Slug solo letras, números y guiones
    const slugClean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
    const dbName    = `tenancy_${slugClean.replace(/-/g, '_')}`

    // Verificar que el slug no exista
    const [exist] = await pool.query('SELECT id FROM tenants WHERE slug = ?', [slugClean])
    if (exist.length) {
      return res.status(409).json({ success: false, error: { code: 'SLUG_EXISTS', message: 'El slug ya está en uso' } })
    }

    // Hash password del admin del tenant
    const hash = await bcrypt.hash(password, 10)

    // Crear registro en BD maestra
    const [result] = await pool.query(`
      INSERT INTO tenants
        (nombre_negocio, slug, db_name, usuario_login, password_hash,
         correo, telefono, fecha_inicio_licencia, fecha_fin_licencia,
         modulos, activo, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [
      nombre_negocio, slugClean, dbName, usuario_login, hash,
      correo || null, telefono || null,
      fecha_inicio_licencia || null, fecha_fin_licencia || null,
      modulos || 'pos,productos,cartera,finanzas,config',
      observaciones || null
    ])

    const tenantId = result.insertId

    // Crear BD del tenant y correr migrations
    await createTenantDB(dbName, nombre_negocio, usuario_login, hash)

    res.status(201).json({
      success: true,
      data: { id: tenantId, slug: slugClean, db_name: dbName }
    })
  } catch (err) {
    console.error('[POST /saas/tenants]', err)
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// PUT /api/saas/tenants/:id — editar tenant
router.put('/tenants/:id', saasAdminAuth, async (req, res) => {
  try {
    const pool = getMasterPool()
    const {
      nombre_negocio, usuario_login, password,
      correo, telefono, fecha_inicio_licencia, fecha_fin_licencia,
      modulos, observaciones
    } = req.body

    let sets   = []
    let values = []

    if (nombre_negocio)        { sets.push('nombre_negocio = ?');        values.push(nombre_negocio) }
    if (usuario_login)         { sets.push('usuario_login = ?');         values.push(usuario_login) }
    if (correo !== undefined)  { sets.push('correo = ?');                values.push(correo) }
    if (telefono !== undefined){ sets.push('telefono = ?');              values.push(telefono) }
    if (fecha_inicio_licencia) { sets.push('fecha_inicio_licencia = ?'); values.push(fecha_inicio_licencia) }
    if (fecha_fin_licencia !== undefined) { sets.push('fecha_fin_licencia = ?'); values.push(fecha_fin_licencia || null) }
    if (modulos)               { sets.push('modulos = ?');               values.push(modulos) }
    if (observaciones !== undefined) { sets.push('observaciones = ?');   values.push(observaciones) }

    if (password) {
      const hash = await bcrypt.hash(password, 10)
      sets.push('password_hash = ?')
      values.push(hash)
    }

    if (!sets.length) return res.status(400).json({ success: false, error: { code: 'NOTHING_TO_UPDATE', message: 'Sin cambios' } })

    values.push(req.params.id)
    await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, values)

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// PATCH /api/saas/tenants/:id/toggle — activar/desactivar
router.patch('/tenants/:id/toggle', saasAdminAuth, async (req, res) => {
  try {
    const pool = getMasterPool()
    const [rows] = await pool.query('SELECT activo FROM tenants WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant no encontrado' } })

    const nuevoEstado = rows[0].activo ? 0 : 1
    await pool.query('UPDATE tenants SET activo = ? WHERE id = ?', [nuevoEstado, req.params.id])

    res.json({ success: true, data: { activo: nuevoEstado } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

module.exports = router
