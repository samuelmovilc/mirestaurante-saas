import { getTenant, getToken, borrarSesion } from './session'

// Vercel reenvía /api/* → http://89.117.56.39:3010/api/* (server-to-server, sin Mixed Content)
const BASE = ''

// Reduce la foto en el navegador (máx 1280 px, JPEG) para que suba rápido y pese poco
async function reducirImagen(file, maxLado = 1280, calidad = 0.82) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, fail) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => fail(new Error('No se pudo leer la imagen. Usa JPG, PNG o WEBP'))
      i.src = url
    })
    const k = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width  = Math.max(1, Math.round(img.naturalWidth  * k))
    c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'               // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', calidad)
  } finally { URL.revokeObjectURL(url) }
}

async function request(path, options = {}) {
  const token = getToken()
  const tenant = getTenant()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant': tenant } : {}),
    ...options.headers,
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 && !path.includes('/login')) {
    borrarSesion()
    window.location.href = tenant ? `/login?tenant=${encodeURIComponent(tenant)}` : '/login'
    throw new Error('Sesión expirada')
  }

  const data = await res.json()

  // La sesión guardada era de otro restaurante: se descarta y se pide iniciar sesión en este.
  if (res.status === 403 && data?.error?.code === 'TENANT_MISMATCH' && !path.includes('/login')) {
    borrarSesion()
    window.location.href = tenant ? `/login?tenant=${encodeURIComponent(tenant)}` : '/login'
    throw new Error(data.error.message)
  }

  if (!data.success) {
    const err = new Error(data.error?.message || 'Error del servidor')
    err.code   = data.error?.code
    err.status = res.status
    throw err
  }

  return data
}

// Si el servidor no trae el nombre de la mesa del pedido, se completa aquí con el catálogo de mesas
// (así la lista, el detalle y la impresión muestran la mesa real que se eligió).
async function conNombreMesa(res) {
  try {
    const filas = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : [])
    if (!filas.some(p => p.mesa_id && !p.mesa_nombre)) return res
    const m = await request('/api/mesas?todos=1')
    const nombres = {}; (m.data || []).forEach(x => { nombres[x.id] = x.nombre })
    filas.forEach(p => { if (p.mesa_id && !p.mesa_nombre) p.mesa_nombre = nombres[p.mesa_id] || null })
  } catch {}
  return res
}

export const api = {
  // AUTH
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/auth/me'),

  // CONFIGURACION
  getConfig:     ()    => request('/api/configuracion'),
  updateConfig:  (data)=> request('/api/configuracion', { method: 'PUT', body: JSON.stringify(data) }),
  updateLogo:    (url) => request('/api/configuracion/logo', { method: 'PUT', body: JSON.stringify({ logo_url: url }) }),
  deleteLogo:    ()    => request('/api/configuracion/logo', { method: 'DELETE' }),

  // CATEGORIAS (público)
  getCategorias:   ()     => request('/api/categorias'),
  createCategoria: (data) => request('/api/categorias', { method: 'POST', body: JSON.stringify(data) }),
  updateCategoria: (id, data) => request(`/api/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategoria: (id)   => request(`/api/categorias/${id}`, { method: 'DELETE' }),

  // MESAS
  getMesas:      ()     => request('/api/mesas'),           // solo activas (formulario pedidos)
  getMesasAdmin: ()     => request('/api/mesas?todos=1'),   // todas (panel admin)
  createMesa:    (data) => request('/api/mesas', { method: 'POST', body: JSON.stringify(data) }),
  updateMesa:    (id, data) => request(`/api/mesas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMesa:    (id)   => request(`/api/mesas/${id}`, { method: 'DELETE' }),

  // VENDEDORES
  getVendedores:   ()     => request('/api/vendedores'),
  createVendedor:  (data) => request('/api/vendedores', { method: 'POST', body: JSON.stringify(data) }),
  updateVendedor:  (id, data) => request(`/api/vendedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVendedor:  (id)   => request(`/api/vendedores/${id}`, { method: 'DELETE' }),

  // METODOS PAGO
  getMetodosPago:   ()     => request('/api/metodos_pago'),
  createMetodoPago: (data) => request('/api/metodos_pago', { method: 'POST', body: JSON.stringify(data) }),
  deleteMetodoPago: (id)   => request(`/api/metodos_pago/${id}`, { method: 'DELETE' }),

  // PRODUCTOS (público)
  getProductos:    (params = {}) => request('/api/productos?' + new URLSearchParams(params)),
  getProducto:     (id)   => request(`/api/productos/${id}`),
  createProducto:  (data) => request('/api/productos', { method: 'POST', body: JSON.stringify(data) }),
  updateProducto:  (id, data) => request(`/api/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProducto:  (id)   => request(`/api/productos/${id}`, { method: 'DELETE' }),
  ajustarStock:    (id, data) => request(`/api/productos/${id}/stock`, { method: 'POST', body: JSON.stringify(data) }),
  movimientosStock: (id)  => request(`/api/productos/${id}/movimientos`),
  importProductos: (data) => request('/api/productos/importar', { method: 'POST', body: JSON.stringify({ productos: data }) }),
  uploadImage:     async (file) => {
    if (!file || !/^image\//.test(file.type)) throw new Error('Selecciona un archivo de imagen (JPG, PNG o WEBP)')
    const imagen = await reducirImagen(file)
    return request('/api/upload', { method: 'POST', body: JSON.stringify({ imagen }) })
  },


  // PEDIDOS
  pedidosActivos:   (vendedor = '') => request('/api/pedidos/activos' + (vendedor ? '?vendedor=' + encodeURIComponent(vendedor) : '')),
  pedidoActivo:     (id) => request(`/api/pedidos/activos/${id}`),
  editarPedidoActivo: (id, data) => request(`/api/pedidos/activos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  mesasOcupadas:  () => request('/api/pedidos/mesas-ocupadas'),
  estadoCaja:     () => request('/api/caja/estado'),
  getPedidos:      async (params = {}) => conNombreMesa(await request('/api/pedidos?' + new URLSearchParams(params))),
  getPedido:       async (id)   => conNombreMesa(await request(`/api/pedidos/${id}`)),
  createPedido:    (data) => request('/api/pedidos', { method: 'POST', body: JSON.stringify(data) }),
  updatePedido:    (id, data) => request(`/api/pedidos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cambiarEstado:   (id, estado) => request(`/api/pedidos/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),

  // VENTAS
  getVentas:       (params = {}) => request('/api/ventas?' + new URLSearchParams(params)),
  getVentaStats:   (params = {}) => request('/api/ventas/stats?' + new URLSearchParams(params)),
  crearVenta:      (data) => request('/api/ventas', { method: 'POST', body: JSON.stringify(data) }),
  anularVenta:     (id)   => request(`/api/ventas/${id}/anular`, { method: 'PATCH' }),
  exportarVentas:  (params= {}) => `${BASE}/api/ventas/export/excel?${new URLSearchParams(params)}&token=${getToken()}`,

  // CAJA (NUEVO SISTEMA)
  getTurnoAbierto: () => request('/api/caja/turno-abierto'),
  abrirCaja:       (data) => request('/api/caja/abrir', { method: 'POST', body: JSON.stringify(data) }),
  cerrarCaja:      () => request('/api/caja/cerrar', { method: 'POST' }),
  getGastos:       (turnoId) => request(`/api/caja/gastos/${turnoId}`),
  crearGasto:      (data) => request('/api/caja/gastos', { method: 'POST', body: JSON.stringify(data) }),
  getHistoricoCajas: () => request('/api/caja/historico'),

  // CARTERA
  getCartera:      (params = {}) => request('/api/cartera?' + new URLSearchParams(params)),
  getPazSalvo:     (trabajador) => request('/api/cartera/paz-salvo?trabajador_nombre=' + encodeURIComponent(trabajador)),
  getPagos:        (id) => request(`/api/cartera/${id}/pagos`),
  registrarAbono:  (id, data) => request(`/api/cartera/${id}/pagos`, { method: 'POST', body: JSON.stringify(data) }),
  eliminarPago:    (pagoId)   => request(`/api/cartera/pagos/${pagoId}`, { method: 'DELETE' }),

  // COSTEOS
  getCosteos:  ()     => request('/api/costeos'),
  getCosteo:   (id)   => request(`/api/costeos/${id}`),
  saveCosteo:  (data) => request('/api/costeos', { method: 'POST', body: JSON.stringify(data) }),
  deleteCosteo:(id)   => request(`/api/costeos/${id}`, { method: 'DELETE' }),
}

export function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtF(f) {
  if (!f) return '—'
  const p = f.split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

export function today() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Fecha (YYYY-MM-DD) en la hora local del navegador (Colombia) de un instante o fecha cualquiera.
export function fechaLocal(v) {
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d)) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Suma días a una fecha YYYY-MM-DD (sin saltos por zona horaria).
export function sumarDias(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  return fechaLocal(new Date(y, m - 1, d + n))
}
