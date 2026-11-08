// Vercel reenvía /api/* → http://89.117.56.39:3010/api/* (server-to-server, sin Mixed Content)
const BASE = ''

function getToken() {
  return localStorage.getItem('token')
}

// Al cargar la app: si la URL trae un restaurante distinto al guardado, se descarta la sesión
// del restaurante anterior (si no, el token/tenant viejos se mezclan con el nuevo).
;(function syncTenantFromUrl() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('tenant')
    if (fromUrl && fromUrl !== localStorage.getItem('tenant')) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      localStorage.setItem('tenant', fromUrl)
    }
  } catch {}
})()

// Lee el tenant del query param ?tenant=xxx o de localStorage
function getTenant() {
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('tenant')
  if (fromUrl) {
    localStorage.setItem('tenant', fromUrl)
    return fromUrl
  }
  return localStorage.getItem('tenant') || ''
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
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    window.location.href = tenant ? `/login?tenant=${encodeURIComponent(tenant)}` : '/login'
    throw new Error('Sesión expirada')
  }

  const data = await res.json()

  if (!data.success) {
    const err = new Error(data.error?.message || 'Error del servidor')
    err.code   = data.error?.code
    err.status = res.status
    throw err
  }

  return data
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
  importProductos: (data) => request('/api/productos/importar', { method: 'POST', body: JSON.stringify({ productos: data }) }),
  uploadImage:     async (file) => {
    const fd = new FormData();
    fd.append('imagen', file);
    const token = localStorage.getItem('token');
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: fd, headers });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Error al subir imagen');
    return data;
  },

  // PEDIDOS
  getPedidos:      (params = {}) => request('/api/pedidos?' + new URLSearchParams(params)),
  getPedido:       (id)   => request(`/api/pedidos/${id}`),
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
