const jwt = require('jsonwebtoken')

// Verifica JWT del usuario de un tenant
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_TOKEN', message: 'Token requerido' }
    })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario   = payload
    next()
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token inválido o expirado' }
    })
  }
}

// Solo admin del tenant
function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Solo administradores' }
    })
  }
  next()
}

// Verifica JWT del superadmin SaaS
function saasAdminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_TOKEN', message: 'Token requerido' }
    })
  }

  try {
    const payload = jwt.verify(token, process.env.SAAS_ADMIN_SECRET)
    if (payload.role !== 'saas_admin') throw new Error('No es saas_admin')
    req.saasAdmin = payload
    next()
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token de admin inválido' }
    })
  }
}

module.exports = { authMiddleware, soloAdmin, saasAdminAuth }
