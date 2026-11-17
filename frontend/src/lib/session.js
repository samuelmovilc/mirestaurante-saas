// Restaurante y sesión, aislados para que NUNCA se mezclen datos entre restaurantes.
//
// - El restaurante activo es POR PESTAÑA (sessionStorage): abrir otro restaurante en otra pestaña
//   del mismo navegador no cambia el de las demás pestañas.
// - La sesión (token + usuario) se guarda POR RESTAURANTE (localStorage, claves token:<slug>):
//   dos restaurantes pueden estar abiertos a la vez sin pisarse la sesión.
// - Una pestaña nueva sin ?tenant= usa el último restaurante usado (comodidad), y a partir de ahí
//   queda fija en él.

const ls = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}
const ss = {
  get: k => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { sessionStorage.setItem(k, v) } catch {} },
}

const limpio = t => String(t || '').trim().toLowerCase()

// Sesiones guardadas por versiones anteriores (una sola clave para todos): se pasan al restaurante al que pertenecían.
;(function migrarSesionAntigua() {
  const t = limpio(ls.get('tenant'))
  const token = ls.get('token'), usuario = ls.get('usuario')
  if (t && token && !ls.get(`token:${t}`)) { ls.set(`token:${t}`, token); if (usuario) ls.set(`usuario:${t}`, usuario) }
  ls.del('token'); ls.del('usuario')
})()

// Restaurante de ESTA pestaña.
export function getTenant() {
  const fromUrl = limpio(new URLSearchParams(window.location.search).get('tenant'))
  if (fromUrl) { ss.set('tenant', fromUrl); ls.set('tenant', fromUrl); return fromUrl }
  const tab = limpio(ss.get('tenant'))
  if (tab) return tab
  const ultimo = limpio(ls.get('tenant'))
  if (ultimo) ss.set('tenant', ultimo)
  return ultimo
}

// Restaurante al que pertenece un token (el backend lo firma dentro del token).
function tenantDelToken(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return limpio(JSON.parse(decodeURIComponent(escape(atob(b64)))).tenant)
  } catch { return '' }
}

// Token de ESTE restaurante. Si por cualquier motivo el token es de otro restaurante, no se usa.
export function getToken() {
  const t = getTenant()
  if (!t) return null
  const token = ls.get(`token:${t}`)
  if (!token) return null
  const dueño = tenantDelToken(token)
  if (dueño && dueño !== t) { ls.del(`token:${t}`); ls.del(`usuario:${t}`); return null }
  return token
}

export function getUsuarioGuardado() {
  const t = getTenant()
  try { return t && getToken() ? JSON.parse(ls.get(`usuario:${t}`) || 'null') : null } catch { return null }
}

export function guardarSesion(token, usuario) {
  const t = getTenant()
  if (!t) return
  ls.set(`token:${t}`, token); ls.set(`usuario:${t}`, JSON.stringify(usuario))
}

export function borrarSesion() {
  const t = getTenant()
  if (!t) return
  ls.del(`token:${t}`); ls.del(`usuario:${t}`)
}
