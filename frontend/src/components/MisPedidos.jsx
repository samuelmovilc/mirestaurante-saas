import { useState, useEffect, useMemo, useRef } from 'react'
import { api, fmt } from '../lib/api'
import { filtrarProductos } from '../lib/buscar'

// Vista simplificada del mesero: lista de pedidos activos y editor con − / + y botón "Actualizar pedido".
export default function MisPedidos({ vendedorNombre, productos, toast }) {
  const [verTodos, setVerTodos] = useState(!vendedorNombre)
  const [lista, setLista] = useState(null)         // null = cargando
  const [sel, setSel] = useState(null)             // pedido en edición
  const [items, setItems] = useState([])
  const [obs, setObs] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [q, setQ] = useState('')
  const [bloqueo, setBloqueo] = useState('')       // mensaje cuando el pedido ya no se puede editar
  const qRef = useRef(null)

  const filtroNombre = verTodos ? '' : vendedorNombre
  const cargar = () => api.pedidosActivos(filtroNombre).then(r => setLista(r.data || [])).catch(e => { setLista(l => l || []); toast(e.message, 'error') })
  useEffect(() => { setLista(null); cargar(); const id = setInterval(() => { if (!sel) cargar() }, 20000); return () => clearInterval(id) }, [filtroNombre, !!sel])

  async function abrir(p) {
    setBloqueo(''); setQ('')
    try {
      const r = await api.pedidoActivo(p.id)
      const d = r.data
      setSel(d); setObs(d.observaciones || '')
      setItems(d.detalle.map(x => ({ producto_id: x.producto_id, nombre_producto: x.nombre_producto, precio_unitario: parseFloat(x.precio_unitario) || 0, cantidad: String(x.cantidad) })))
    } catch (e) { toast(e.message, 'error'); cargar() }
  }
  function cerrar() { setSel(null); setBloqueo(''); cargar() }

  const total = useMemo(() => items.reduce((s, it) => s + it.precio_unitario * (parseInt(it.cantidad) || 0), 0), [items])
  const setCant = (idx, v) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: v } : it))
  const quitar = idx => setItems(prev => prev.filter((_, i) => i !== idx))
  const agotado = p => !!p.controla_stock && p.stock <= 0
  function agregar(p) {
    if (agotado(p)) return
    setItems(prev => {
      const i = prev.findIndex(it => it.producto_id == p.id)
      if (i >= 0) return prev.map((it, k) => k === i ? { ...it, cantidad: String((parseInt(it.cantidad) || 0) + 1) } : it)
      return [...prev, { producto_id: p.id, nombre_producto: p.nombre, precio_unitario: parseFloat(p.precio_venta) || 0, cantidad: '1' }]
    })
    setQ(''); qRef.current?.focus()
  }
  const resultados = useMemo(() => q.trim() ? filtrarProductos(productos, q, 20) : [], [productos, q])

  async function guardar() {
    if (!items.length) return toast('El pedido debe tener al menos un producto', 'error')
    setGuardando(true)
    try {
      await api.editarPedidoActivo(sel.id, {
        items: items.map(it => ({ producto_id: it.producto_id, cantidad: Math.max(1, parseInt(it.cantidad) || 1) })),
        observaciones: obs, editor: vendedorNombre || 'Mesero', version: sel.updated_at,
      })
      toast(`Pedido #${sel.numero} actualizado ✓`, 'success'); cerrar()
    } catch (e) {
      toast(e.message, 'error')
      if (e.code === 'PEDIDO_CAMBIO') abrir(sel)            // recarga la versión nueva
      else if (e.code === 'PEDIDO_CERRADO') setBloqueo(e.message)
    } finally { setGuardando(false) }
  }

  // ───────── Editor ─────────
  if (sel) return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar} style={{ marginBottom: 10 }}>← Volver a mis pedidos</button>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Pedido #{sel.numero}</h3>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{sel.mesa_nombre || 'Sin mesa'}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>{sel.cliente_nombre}</div>

        {bloqueo && <div role="alert" style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{bloqueo}</div>}

        {items.map((it, idx) => {
          const cant = parseInt(it.cantidad) || 0
          return (
            <div key={it.producto_id + '-' + idx} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light, var(--border))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{it.nombre_producto}</span>
                <button type="button" aria-label="Quitar producto" onClick={() => quitar(idx)} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '0 6px' }}>×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button type="button" className="qty-btn" aria-label="Disminuir cantidad" disabled={cant <= 1} onClick={() => setCant(idx, String(Math.max(1, cant - 1)))}>−</button>
                <input className="input qty-input" type="text" inputMode="numeric" aria-label="Cantidad" value={it.cantidad}
                  onFocus={e => e.target.select()} onChange={e => setCant(idx, e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => setCant(idx, String(Math.max(1, parseInt(it.cantidad) || 1)))} />
                <button type="button" className="qty-btn" aria-label="Aumentar cantidad" onClick={() => setCant(idx, String(cant + 1))}>+</button>
                <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800 }}>{fmt(it.precio_unitario * cant)}</span>
              </div>
            </div>
          )
        })}
        {!items.length && <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--text3)' }}>Sin productos. Busca abajo para agregar.</div>}

        <div className="prod-search-wrap" style={{ marginTop: 14 }}>
          <input ref={qRef} className="input" type="search" autoComplete="off" placeholder="🔍  Buscar y agregar producto..." value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const p = resultados.find(x => !agotado(x)); if (p) agregar(p) } }} />
          {q.trim() && (
            <div className="prod-results">
              {resultados.length === 0 && <div className="prod-result-item" style={{ color: 'var(--text3)', cursor: 'default' }}>Sin resultados</div>}
              {resultados.map(p => (
                <div key={p.id} className="prod-result-item" onClick={() => agregar(p)} style={agotado(p) ? { opacity: .5, cursor: 'not-allowed' } : undefined}>
                  <span>{p.nombre}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="prod-result-price">{agotado(p) ? 'Agotado' : fmt(p.precio_venta)}</span>
                    {!agotado(p) && <button type="button" className="qty-btn qty-btn-add" aria-label={`Agregar ${p.nombre}`} onClick={e => { e.stopPropagation(); agregar(p) }}>+</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="input" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Observaciones del pedido…" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
          <span style={{ fontWeight: 700 }}>Total</span><span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{fmt(total)}</span>
        </div>
        <button type="button" className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 800 }} disabled={guardando || !items.length || !!bloqueo} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Actualizar pedido'}
        </button>
      </div>
    </div>
  )

  // ───────── Lista ─────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 15 }}>{verTodos ? 'Todos los pedidos activos' : `Pedidos de ${vendedorNombre}`}</b>
        {vendedorNombre && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={verTodos} onChange={e => setVerTodos(e.target.checked)} /> Ver todos
          </label>
        )}
      </div>
      {lista === null && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Cargando…</div>}
      {lista && lista.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No hay pedidos activos{!verTodos && vendedorNombre ? ' tuyos' : ''}.</div>}
      {lista && lista.map(p => (
        <button type="button" key={p.id} onClick={() => abrir(p)} className="card"
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8, cursor: 'pointer', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ fontSize: 15 }}>#{p.numero} · {p.mesa_nombre || (p.tipo === 'domicilio' ? 'Domicilio' : 'Para llevar')}</b>
            <b style={{ fontSize: 15 }}>{fmt(p.total)}</b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{p.cliente_nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {p.unidades} producto{p.unidades == 1 ? '' : 's'}
            {verTodos && p.vendedor_nombre ? ` · ${p.vendedor_nombre}` : ''}{p.editado_por ? ' · ✎ editado' : ''}
          </div>
        </button>
      ))}
    </div>
  )
}
