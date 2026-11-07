// Auth del tenant (login de cada restaurante)
const express = require('express')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

// POST /api/auth/login  (requiere X-Tenant header)
router.post('/login', async (req, res) => {
  try {
    const { email, username, password } = req.body
    const login = username || email
    if (!login || !password) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Usuario y password requeridos' } })
    }

    const pool = req.tenantPool
    // Busca por nombre (el usuario_login guardado) O por email
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE (nombre = ? OR email = ?) AND activo = 1 LIMIT 1',
      [login, login]
    )

    if (!rows.length) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } })
    }

    const user = rows[0]
    const ok   = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, tenant: req.tenant.slug },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    res.json({
      success: true,
      data: {
        token,
        usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const pool = req.tenantPool
    const [rows] = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1',
      [req.usuario.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

module.exports = router
