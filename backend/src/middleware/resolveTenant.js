// Middleware: detecta el tenant por header X-Tenant o query param ?tenant=
// y adjunta pool + info a req.tenant
const { getMasterPool } = require('../db/master')
const { getTenantPool } = require('../db/tenant')
const { ensureTenantSchema } = require('../db/ensureSchema')

async function resolveTenant(req, res, next) {
  try {
    // El frontend manda el slug en header X-Tenant o ?tenant=slug
    const slug = (req.headers['x-tenant'] || req.query.tenant || '').trim().toLowerCase()

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: { code: 'TENANT_MISSING', message: 'Tenant no especificado' }
      })
    }

    const master = getMasterPool()
    const [rows] = await master.query(
      'SELECT * FROM tenants WHERE slug = ? AND activo = 1 LIMIT 1',
      [slug]
    )

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Restaurante no encontrado o inactivo' }
      })
    }

    const tenant = rows[0]

    // Verificar licencia
    if (tenant.fecha_fin_licencia) {
      const ahora = new Date()
      const fin   = new Date(tenant.fecha_fin_licencia)
      if (ahora > fin) {
        return res.status(403).json({
          success: false,
          error: { code: 'LICENSE_EXPIRED', message: 'Licencia vencida. Contacta al administrador.' }
        })
      }
    }

    req.tenant     = tenant
    req.tenantPool = getTenantPool(tenant.db_name)
    await ensureTenantSchema(req.tenantPool, tenant.db_name)
    next()
  } catch (err) {
    console.error('[resolveTenant]', err.message)
    res.status(500).json({
      success: false,
      error: { code: 'TENANT_ERROR', message: 'Error al identificar el restaurante' }
    })
  }
}

module.exports = resolveTenant
