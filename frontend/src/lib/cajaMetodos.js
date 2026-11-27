// Desglose de caja por método de pago (solo frontend: no requiere cambios en el servidor).
// Ingresos: salen de las ventas (metodos_resumen "Efectivo: $1000 | Tarjeta: $500").
// Egresos: el método del gasto se guarda al final de la descripción como " [MP:Efectivo]"
// (la tabla caja_gastos no tiene columna de método); los gastos viejos quedan "Sin especificar".
const SIN = 'Sin especificar'
const RE_MP = /\s*\[MP:([^\]]*)\]\s*$/

export function codificarDescripcionGasto(categoria, observacion, metodo) {
  return `${categoria}${observacion ? ' - ' + observacion : ''} [MP:${metodo}]`
}

export function parseGasto(g) {
  const raw = String(g.descripcion || '')
  const m = raw.match(RE_MP)
  const texto = raw.replace(RE_MP, '')
  const i = texto.indexOf(' - ')
  return {
    categoria: g.categoria || (i >= 0 ? texto.slice(0, i) : texto),
    observacion: g.observacion || (i >= 0 ? texto.slice(i + 3) : ''),
    metodo: (g.metodo_pago || (m ? m[1] : '') || SIN).trim() || SIN,
    monto: parseFloat(g.monto || 0),
  }
}

function sumar(map, nombre, monto) {
  if (!monto) return
  map.set(nombre, (map.get(nombre) || 0) + monto)
}

export function ventasDelTurno(ventas, turno) {
  const ini = new Date(turno.fecha_apertura).getTime()
  const fin = turno.fecha_cierre ? new Date(turno.fecha_cierre).getTime() : Infinity
  return (ventas || []).filter(v => {
    const t = new Date(v.created_at).getTime()
    return v.estado !== 'anulada' && t >= ini && t <= fin
  })
}

export function desgloseCaja({ ventas, gastos, saldoInicial }) {
  const ing = new Map(), egr = new Map()
  for (const v of ventas || []) {
    if (v.estado === 'anulada') continue
    const partes = String(v.metodos_resumen || '').split(' | ').filter(Boolean)
    if (!partes.length) { sumar(ing, SIN, parseFloat(v.total || 0)); continue }
    for (const p of partes) {
      const k = p.lastIndexOf(': $')
      if (k < 0) continue
      sumar(ing, p.slice(0, k).trim() || SIN, parseFloat(p.slice(k + 3)) || 0)
    }
  }
  for (const g of gastos || []) { const p = parseGasto(g); sumar(egr, p.metodo, p.monto) }

  const inicial = parseFloat(saldoInicial || 0)
  const nombres = [...new Set([...ing.keys(), ...egr.keys()])]
  let nomEfectivo = nombres.find(n => /efectivo/i.test(n))
  if (!nomEfectivo && inicial) { nomEfectivo = 'Efectivo'; nombres.unshift(nomEfectivo) }
  const metodos = nombres.map(n => {
    const i0 = n === nomEfectivo ? inicial : 0
    const i = ing.get(n) || 0, e = egr.get(n) || 0
    return { nombre: n, inicial: i0, ingresos: i, egresos: e, total: i0 + i - e }
  })
  const arr = m => [...m.entries()].map(([nombre, total]) => ({ nombre, total }))
  return {
    ingresos: arr(ing), egresos: arr(egr), metodos,
    total: metodos.reduce((s, m) => s + m.total, 0),
  }
}
