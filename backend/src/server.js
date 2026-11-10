require('dotenv').config()
const express     = require('express')
const cors        = require('cors')
const helmet      = require('helmet')
const rateLimit   = require('express-rate-limit')

const { verifyMasterConnection } = require('./db/master')
const resolveTenant = require('./middleware/resolveTenant')

// Rutas tenant (requieren X-Tenant)
const authRoutes          = require('./routes/auth')
const configuracionRoutes = require('./routes/configuracion')
const { categoriasRouter, mesasRouter, vendedoresRouter, metodosPagoRouter } = require('./routes/catalogo')
const productosRoutes     = require('./routes/productos')
const pedidosRoutes       = require('./routes/pedidos')
const ventasRoutes        = require('./routes/ventas')
const cajaRoutes          = require('./routes/caja')
const carteraRoutes       = require('./routes/cartera')
const costeosRoutes       = require('./routes/costeos')
const { router: uploadRoutes, UPLOAD_DIR } = require('./routes/upload')

// Rutas SaaS superadmin (sin tenant)
const saasAdminRoutes = require('./routes/saasAdmin')

const app  = express()
const PORT = process.env.PORT || 3010

// ── Seguridad ─────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim())
    // Permite sin origin (Postman, curl) en desarrollo
    if (!origin || allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
      return cb(null, true)
    }
    cb(new Error('CORS bloqueado: ' + origin))
  },
  credentials: true,
}))
app.use(express.json({ limit: '5mb' }))
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true }))

// ── Health check ──────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await verifyMasterConnection()
    res.json({ success: true, service: 'mirestaurante-saas', port: PORT, status: 'connected' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Rutas SaaS admin (sin tenant) ─────────────────────────
app.use('/api/saas', saasAdminRoutes)

// ── Imágenes subidas (públicas; los nombres son aleatorios, no se pueden listar) ──
app.use('/api/uploads', express.static(UPLOAD_DIR, {
  index: false, dotfiles: 'ignore', maxAge: '7d',
  setHeaders: (res) => { res.set('Cross-Origin-Resource-Policy', 'cross-origin'); res.set('X-Content-Type-Options', 'nosniff') },
}))

// ── Todas las rutas de tenant pasan primero por resolveTenant ──
app.use('/api', resolveTenant)
app.use('/api/auth',          authRoutes)
app.use('/api/configuracion', configuracionRoutes)
app.use('/api/categorias',    categoriasRouter)
app.use('/api/mesas',         mesasRouter)
app.use('/api/vendedores',    vendedoresRouter)
app.use('/api/metodos_pago',  metodosPagoRouter)
app.use('/api/productos',     productosRoutes)
app.use('/api/pedidos',       pedidosRoutes)
app.use('/api/ventas',        ventasRoutes)
app.use('/api/caja',          cajaRoutes)
app.use('/api/cartera',       carteraRoutes)
app.use('/api/costeos',       costeosRoutes)
app.use('/api/upload',        uploadRoutes)

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { code: 'TOO_LARGE', message: 'El archivo es demasiado pesado' } })
  }
  console.error('[ERROR]', err.message)
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } })
})

// ── Arrancar ──────────────────────────────────────────────
verifyMasterConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 MiRestaurante SaaS API corriendo en puerto ${PORT}`)
    })
  })
  .catch(err => {
    console.error('❌ No se pudo conectar a la BD maestra:', err.message)
    process.exit(1)
  })
