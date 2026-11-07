import { useState, useEffect, useRef } from 'react'
import { api, fmt, fmtF, today } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { downloadFacturaPDF, downloadComandasPDF } from '../../lib/pdfHelpers'

// NOTA: La DB usa 'entregado' como estado cuando un pedido es liquidado/pagado.
// El frontend muestra 'entregado' como "Liquidado" para el usuario.
const EST_MAP = {
  pendiente:   { label: 'Pendiente',      cls: 'badge-gray'   },
  entregado:   { label: 'Liquidado',      cls: 'badge-purple' },
  cancelado:   { label: 'Cancelado',      cls: 'badge-red'    },
}
const TIPO_LABEL = { mesa: 'Mesa', domicilio: 'Domicilio', venta_interna: 'Interna', credito: 'Crédito' }

export default function PedidosAdmin() {
  const { toast, ToastContainer } = useToast()
  const [config, setConfig]           = useState({})
  const [pedidos, setPedidos]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [selPedido, setSelPedido]     = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [metodosPago, setMetodosPago] = useState([])
  const [liqMPs, setLiqMPs]           = useState([{ mp: '', monto: '' }])
  const [liqCliente, setLiqCliente]   = useState('')
  const [liqObs, setLiqObs]           = useState('')
  const [guardando, setGuardando]     = useState(false)
  const [liquidando, setLiquidando]   = useState(false)
  const prodSearchRef = useRef(null)
  const [prodResults, setProdResults] = useState([])
  const [itemsEdit, setItemsEdit]     = useState([])
  const [obsEdit, setObsEdit]         = useState('')

  // FILTROS
  const [fFecha, setFFecha]   = useState(today())
  const [fMesero, setFMesero] = useState('')
  const [fTipo, setFTipo]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('pendiente') // 'todas', 'pendiente', 'entregado', 'cancelado'
  const [fOrden, setFOrden]   = useState('desc')
  const [fTexto, setFTexto]   = useState('')

  async function cargarPedidos(params = {}) {
    setLoading(true)
    try {
      const p = { fecha: fFecha, orden: fOrden, ...params }
      if (fMesero) p.vendedor_nombre = fMesero
      if (fTipo)   p.tipo_pedido = fTipo
      // Enviar filtro de estado al backend para que filtre en la DB
      // 'liquidado' en el UI = 'entregado' en la DB
      const estadoDB = (params.filtroEstado ?? filtroEstado)
      if (estadoDB === 'liquidado') p.estado = 'entregado'
      else if (estadoDB !== 'todas') p.estado = estadoDB
      const res = await api.getPedidos(p)
      setPedidos(res.data || [])
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    cargarPedidos()
    api.getMetodosPago().then(r => setMetodosPago(r.data || [])).catch(() => {})
    api.getConfig().then(r => setConfig(r.data || {})).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, fFecha, fTipo, fOrden])

  function verDetalle(ped) {
    const items = typeof ped.items === 'string' ? JSON.parse(ped.items || '[]') : (ped.items || [])
    setSelPedido(ped)
    setItemsEdit(items.map(it => ({ ...it })))
    setObsEdit(ped.observaciones || '')
    setLiqCliente(ped.nombre_cliente || '')
    setLiqObs(ped.observaciones || '')
    setLiqMPs([{ mp: '', monto: '' }])
  }

  function calcTotal() {
    return itemsEdit.reduce((s, it) => s + (parseFloat(it.precio_unitario) || 0) * (parseInt(it.cantidad) || 1), 0)
  }

  async function buscarProducto(q) {
    if (!q.trim()) { setProdResults([]); return }
    try {
      const res = await api.getProductos({ q, activo: 1 })
      setProdResults(res.data || [])
    } catch (e) {}
  }

  function agregarProducto(prod) {
    setItemsEdit(prev => {
      const ex = prev.find(it => it.producto_id == prod.id)
      if (ex) return prev.map(it => it.producto_id == prod.id ? { ...it, cantidad: it.cantidad + 1 } : it)
      return [...prev, { producto_id: prod.id, nombre_producto: prod.nombre, precio_unitario: prod.precio_venta, precio_costo: prod.precio_costo, cantidad: 1, nota: '' }]
    })
    setProdResults([])
    if (prodSearchRef.current) prodSearchRef.current.value = ''
  }

  function updItem(idx, field, val) {
    setItemsEdit(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function quitarItem(idx) {
    setItemsEdit(prev => prev.filter((_, i) => i !== idx))
  }

  async function actualizarPedido() {
    if (!selPedido) return
    setGuardando(true)
    try {
      await api.updatePedido(selPedido.id, {
        observaciones: obsEdit,
        items: itemsEdit.map(it => ({
          producto_id: it.producto_id || null,
          nombre_producto: it.nombre_producto,
          precio_unitario: parseFloat(it.precio_unitario) || 0,
          precio_costo: parseFloat(it.precio_costo) || 0,
          cantidad: parseInt(it.cantidad) || 1,
          nota: it.nota || null,
        }))
      })
      toast('Pedido actualizado')
      cargarPedidos()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }

  // Anula un pedido inteligentemente:
  // - Si estaba liquidado (entregado): busca y anula la venta asociada primero (para que no cuente en Caja)
  // - En cualquier caso: marca el pedido como cancelado
  async function anularPedido(ped) {
    const nombre = ped.nombre_cliente || `Pedido #${ped.numero_pedido}`
    const yaLiquidado = ped.estado === 'entregado'
    const msg = yaLiquidado
      ? `¿Anular pedido #${ped.numero_pedido} de ${nombre}?\n\n⚠️ Este pedido YA FUE LIQUIDADO. Se anulará también la venta en Caja (no sumará en el cierre).`
      : `¿Anular pedido #${ped.numero_pedido} de ${nombre}?`
    if (!window.confirm(msg)) return
    try {
      // Si estaba liquidado, primero anulamos la venta via /api/ventas/:id/anular
      // El backend de anular venta ya marca también el pedido como cancelado
      if (yaLiquidado) {
        // Buscar la venta asociada a este pedido
        const ventasRes = await api.getVentas({ pedido_id: ped.id })
        const ventaActiva = (ventasRes.data || []).find(v => v.estado === 'ACEPTADA' && v.pedido_id === ped.id)
        if (ventaActiva) {
          await api.anularVenta(ventaActiva.id)
          toast(`✅ Venta y pedido #${ped.numero_pedido} anulados`, 'success')
        } else {
          // Venta no encontrada o ya anulada, solo cancelar el pedido
          await api.cambiarEstado(ped.id, 'cancelado')
          toast(`Pedido #${ped.numero_pedido} cancelado`, 'success')
        }
      } else {
        await api.cambiarEstado(ped.id, 'cancelado')
        toast(`Pedido #${ped.numero_pedido} cancelado`, 'success')
      }
      setSelPedido(null)
      cargarPedidos()
    } catch (e) { toast(e.message, 'error') }
  }

  async function liquidar() {
    const mpsSel = liqMPs.filter(m => m.mp)
    if (!mpsSel.length) return toast('Selecciona al menos un método de pago', 'error')
    setLiquidando(true)
    const total = calcTotal()
    try {
      let mpsConTipo = mpsSel.map(m => {
        const mp = metodosPago.find(x => x.nombre === m.mp) || {}
        return { nombre: m.mp, tipo: mp.tipo || 'efectivo', monto: parseFloat(m.monto) || 0 }
      })
      
      // Ajustar si el cliente dio billetes más grandes (vueltas) para no inflar la venta
      let pagado = mpsConTipo.reduce((s, m) => s + m.monto, 0)
      let cambio = pagado - total
      if (cambio > 0) {
        // Restar el cambio del efectivo si es posible
        let ef = mpsConTipo.find(m => m.tipo === 'efectivo' && m.monto >= cambio)
        if (ef) {
          ef.monto -= cambio
        } else {
          // O restarlo del que se pueda
          for (let m of mpsConTipo) {
            if (m.monto >= cambio) {
              m.monto -= cambio
              break
            } else {
              cambio -= m.monto
              m.monto = 0
            }
          }
        }
      }
      
      const res = await api.crearVenta({
        pedido_id: selPedido.id,
        cliente_nombre: liqCliente,
        observaciones: liqObs,
        metodos_pago: mpsConTipo,
        total,
      })
      
      // Auto-generar factura PDF
      downloadFacturaPDF(selPedido, mpsConTipo, total, cambio, config)
      // NOTA: El backend (ventas.js) ya actualiza el estado del pedido a 'entregado'
      // automáticamente al crear la venta. NO hay que llamar cambiarEstado aquí.

      toast(`Pedido liquidado con éxito. (Folio: ${res.data?.folio || ''})`, 'success', 4000)
      setSelPedido(null)
      cargarPedidos()
    } catch (e) { toast(e.message, 'error') }
    finally { setLiquidando(false) }
  }

  function imprimirFactura(p) {
    downloadFacturaPDF(p, null, null, null, config)
  }

  function generarComandas() {
    const sel = pedidos.filter(p => selectedIds.includes(p.id))
    if (!sel.length) return toast('Por favor selecciona al menos un pedido para imprimir la comanda', 'error')
    downloadComandasPDF(sel, config)
  }

  const txtLow = fTexto.toLowerCase().trim()
  const pedidosFiltrados = pedidos.filter(p => {
    if (!txtLow) return true
    const n = String(p.numero_pedido || '').toLowerCase()
    const c = String(p.nombre_cliente || '').toLowerCase()
    return n.includes(txtLow) || c.includes(txtLow)
  })

  return (
    <div>
      <ToastContainer />
      <div className="page-header" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 24, marginBottom: 16 }}>
        <div>
          <h2>Pedidos</h2>
          <p>Gestión de órdenes activas y liquidación.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Estado General', value: `${pedidosFiltrados.filter(p => p.estado === 'entregado').length} Liq`, sub: `${pedidosFiltrados.filter(p => p.estado === 'pendiente').length} Pendientes` },
            { label: 'En Filtro', value: pedidosFiltrados.length, sub: 'Actual' },
          ].map((s, i) => (
            <div key={i} className="stat-card" style={{ minWidth: 140, padding: '10px 14px' }}>
              <div className="stat-label" style={{ fontSize: 9, marginBottom: 4 }}>{s.label}</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{s.value}</div>
              <div className="stat-sub" style={{ fontSize: 10, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* FILTROS */}
          <div className="filters-bar" style={{ marginBottom: 24 }}>
            <div className="filter-group">
              <label className="filter-label">Fecha</label>
              <input className="filter-input" type="date" value={fFecha} onChange={e => setFFecha(e.target.value)} />
            </div>
            <div className="filter-group">
              <label className="filter-label">Tipo</label>
              <select className="filter-input" value={fTipo} onChange={e => setFTipo(e.target.value)}>
                <option value="">Todos</option>
                <option value="mesa">Mesa</option>
                <option value="domicilio">Domicilio</option>
                <option value="venta_interna">Interna</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label">Estado</label>
              <select className="filter-input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="todas">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="entregado">Liquidado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label">Ordenar</label>
              <select className="filter-input" value={fOrden} onChange={e => setFOrden(e.target.value)}>
                <option value="desc">Más reciente</option>
                <option value="asc">Más antiguo</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label">Buscar (# o Cliente)</label>
              <input className="filter-input" type="text" placeholder="Ej: 1054 o María" value={fTexto} onChange={e => setFTexto(e.target.value)} />
            </div>
            <button className="btn" style={{ background: 'var(--primary)', color: '#FFFFFF', fontWeight: 700 }} onClick={() => cargarPedidos()}>Refrescar</button>
            <button className="btn btn-ghost" onClick={() => { setFFecha(today()); setFTipo(''); setFiltroEstado('todas'); setFOrden('desc'); setFTexto(''); cargarPedidos({ fecha: today() }) }}>Limpiar</button>
            
            <div style={{ flex: 1 }} />
            <button className="btn btn-dark" style={{ padding: '8px 20px' }} onClick={generarComandas} disabled={!selectedIds.length}>
              {selectedIds.length > 1 ? `Generar ${selectedIds.length} comandas` : 'Generar comanda'}
            </button>
          </div>

          {/* TABLA DE PEDIDOS */}
          <div className="card">
          <div className="card-header">
            <div><h3>Órdenes activas</h3><p>{pedidosFiltrados.length} resultado{pedidosFiltrados.length !== 1 ? 's' : ''}</p></div>
            <button className="btn btn-ghost btn-sm" onClick={() => { window.print() }}>Imprimir seleccionados</button>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 1000, borderSpacing: 0, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ width: 32, padding: '12px 16px' }}>
                      <input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? pedidosFiltrados.map(p => p.id) : [])} />
                    </th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Pedido</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Fecha / Hora</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Cliente</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Mesa</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Mesero</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Productos</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Obs.</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Total</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Estado</th>
                    <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', textAlign: 'left', padding: '12px 0' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltrados.map(p => {
                    const e = EST_MAP[p.estado] || EST_MAP.pendiente
                    const items = typeof p.items === 'string' ? JSON.parse(p.items || '[]') : (p.items || [])
                    const resumenProductos = items.map(it => `${it.cantidad}x ${it.nombre_producto}`).join(', ')
                    const d = new Date(p.created_at)
                    return (
                      <tr key={p.id} onClick={() => verDetalle(p)} style={{ cursor: 'pointer', background: selPedido?.id === p.id ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                        <td onClick={ev => ev.stopPropagation()} style={{ padding: '12px 16px' }}>
                          <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={ev => setSelectedIds(prev => ev.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                        </td>
                        <td style={{ padding: '12px 0' }}><strong>#{p.numero_pedido}</strong></td>
                        <td style={{ color: 'var(--text3)', fontSize: 11, padding: '12px 0' }}>
                          {d.toLocaleDateString('es-CO')}<br/>
                          <strong>{d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</strong>
                        </td>
                        <td style={{ padding: '12px 0', fontSize: 12 }}>{p.nombre_cliente || '—'}</td>
                        <td style={{ padding: '12px 0', fontSize: 12 }}>{p.mesa_nombre || <span style={{ color: 'var(--text3)', fontSize: 11 }}>{TIPO_LABEL[p.tipo_pedido]}</span>}</td>
                        <td style={{ padding: '12px 0', fontSize: 11 }}>{p.vendedor_nombre || 'Admin'}</td>
                        <td style={{ padding: '12px 0', fontSize: 11, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={resumenProductos}>
                          {resumenProductos || '—'}
                        </td>
                        <td style={{ padding: '12px 0', fontSize: 11, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.observaciones}>
                          {p.observaciones || '—'}
                        </td>
                        <td style={{ padding: '12px 0' }}><strong>{fmt(p.total)}</strong></td>
                        <td onClick={ev => ev.stopPropagation()} style={{ padding: '12px 0' }}>
                          <div className={`badge ${EST_MAP[p.estado]?.cls || 'badge-gray'}`} style={{ padding: '6px 12px', fontSize: 12 }}>
                            {EST_MAP[p.estado]?.label || p.estado}
                          </div>
                        </td>
                        <td onClick={ev => ev.stopPropagation()} style={{ padding: '12px 0' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-xs" style={{ padding: '4px 8px', color: 'var(--text2)' }} onClick={() => {
                              if (p.estado !== 'entregado') {
                                toast('⚠️ Por favor, liquida el pedido en el carrito primero antes de imprimir.', 'error', 4000)
                                verDetalle(p)
                              } else {
                                imprimirFactura(p)
                              }
                            }}>🖨️ Factura</button>
                            <button className="btn btn-ghost btn-xs" style={{ padding: '4px 8px', color: 'var(--primary)' }} onClick={() => verDetalle(p)}>✏️ Editar</button>
                            {p.estado !== 'cancelado' && (
                              <button className="btn btn-ghost btn-xs" style={{ padding: '4px 8px', color: '#ef4444' }} onClick={() => anularPedido(p)}>🗑️</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!pedidosFiltrados.length && (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: 28, color: 'var(--text3)', fontSize: 13 }}>Sin pedidos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* PANEL LATERAL DE DETALLE (EL CARRITO SIEMPRE VISIBLE) */}
      <div className="card" style={{ width: 440, flexShrink: 0, position: 'sticky', top: 84, minHeight: 600 }}>
          {!selPedido ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, color: 'var(--text3)', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>🛒</div>
              <h3 style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 8 }}>Carrito vacío</h3>
              <p style={{ fontSize: 12 }}>Haz clic en cualquier pedido de la tabla a la izquierda para cargar sus datos aquí, editar sus productos o proceder con la liquidación.</p>
            </div>
          ) : (
            <>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 18 }}>Pedido #{selPedido.numero_pedido}</h3>
                  <p>{selPedido.nombre_cliente || '—'} · {TIPO_LABEL[selPedido.tipo_pedido]}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.1)' }}
                    disabled={selPedido.estado === 'cancelado'}
                    onClick={() => anularPedido(selPedido)}>🗑️ Anular</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelPedido(null)}>✕ Cerrar</button>
                </div>
              </div>

            <div className="card-body" style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
              {/* ESTADO */}
              <div className="detail-section" style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>Estado actual</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ 
                    background: selPedido.estado === 'entregado' ? '#166534' : 'var(--bg3)', 
                    color: selPedido.estado === 'entregado' ? '#4ade80' : 'var(--text)', 
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: selPedido.estado === 'entregado' ? '1px solid #14532d' : '1px solid var(--border)' 
                  }}>
                    {EST_MAP[selPedido.estado]?.label}
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    Hora: {new Date(selPedido.created_at).toLocaleTimeString('es-CO')}<br/>
                    Mesa: {selPedido.mesa_nombre || 'Mesa 1'}
                  </div>
                </div>
              </div>

              {/* PRODUCTOS EDITABLES */}
              <div className="detail-section" style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>Productos</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 70px 24px', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700 }}>
                  <span>Producto</span>
                  <span style={{ textAlign: 'center' }}>Cant</span>
                  <span style={{ textAlign: 'right' }}>P.Unit</span>
                  <span style={{ textAlign: 'right' }}>Sub</span>
                  <span></span>
                </div>
                
                {itemsEdit.map((it, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 70px 24px', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{it.nombre_producto}</span>
                    <input className="input" type="number" value={it.cantidad} min="1" style={{ textAlign: 'center', padding: '4px', fontSize: 12, background: 'var(--bg3)', border: 'none' }} onChange={e => updItem(idx, 'cantidad', parseInt(e.target.value) || 1)} />
                    <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)' }}>{it.precio_unitario}</span>
                    <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{fmt((parseFloat(it.precio_unitario)||0) * (parseInt(it.cantidad)||1))}</span>
                    <button className="btn btn-ghost btn-xs" style={{ padding: 0, color: '#ef4444' }} onClick={() => quitarItem(idx)}>×</button>
                  </div>
                ))}

                <div className="prod-search-wrap">
                  <input ref={prodSearchRef} className="input" style={{ width: '100%', marginTop: 12, background: 'var(--bg3)', border: 'none', padding: '10px 14px' }} placeholder="Buscar y agregar producto..." onChange={e => buscarProducto(e.target.value)} />
                  {prodResults.length > 0 && (
                    <div className="prod-results">
                      {prodResults.map(p => (
                        <div key={p.id} className="prod-result-item" onClick={() => agregarProducto(p)}>
                          <span>{p.nombre}</span>
                          <span className="prod-result-price">{fmt(p.precio_venta)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* OBSERVACIONES */}
              <div className="detail-section" style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>Observaciones</div>
                <textarea className="input" style={{ minHeight: 40, fontSize: 12, padding: '10px 14px' }} value={obsEdit} onChange={e => setObsEdit(e.target.value)} placeholder="Observaciones del pedido..." />
              </div>

              {/* TOTAL Y ACTUALIZAR */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', fontSize: 15, fontWeight: 800 }}>
                <span>Total</span><span style={{ color: 'var(--primary)', fontSize: 20 }}>{fmt(calcTotal())}</span>
              </div>

              <button className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 24, background: 'var(--primary)', color: '#FFFFFF', fontWeight: 800, padding: 12 }} onClick={actualizarPedido} disabled={guardando || selPedido.estado === 'entregado'}>
                {guardando ? 'Guardando...' : 'Actualizar pedido'}
              </button>

              {/* LIQUIDACIÓN SIMPLIFICADA */}
              {selPedido.estado === 'entregado' ? (
                <div style={{ padding: '24px', background: 'rgba(22, 101, 52, 0.2)', border: '1px solid #14532d', borderRadius: 12, textAlign: 'center', marginTop: 10 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <h4 style={{ color: '#4ade80', fontWeight: 800, marginBottom: 4 }}>VENTA FACTURADA</h4>
                  <p style={{ fontSize: 12, color: 'var(--text3)' }}>Este pedido ya fue liquidado. No se pueden modificar los métodos de pago para evitar doble facturación.</p>
                </div>
              ) : selPedido.estado === 'cancelado' ? (
                <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 12, textAlign: 'center', marginTop: 20 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>❌</div>
                  <h4 style={{ color: '#b91c1c', fontWeight: 800, marginBottom: 4 }}>PEDIDO ANULADO</h4>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Este pedido fue cancelado y no puede ser facturado.</p>
                </div>
              ) : (
                <div className="liq-section" style={{ background: 'var(--bg2)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)', marginTop: 24 }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Total a pagar</span>
                    <span style={{ fontSize: 24, fontWeight: 900, color: '#3B82F6' }}>{fmt(calcTotal())}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase' }}>Métodos de pago</label>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      const faltante = calcTotal() - liqMPs.reduce((acc, x) => acc + (parseFloat(x.monto) || 0), 0);
                      setLiqMPs([...liqMPs, { mp: '', monto: faltante > 0 ? faltante : '' }])
                    }}>
                      + Agregar
                    </button>
                  </div>

                  {liqMPs.map((mp, i) => (
                    <div key={i} className="mp-row" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <select className="input" style={{ flex: 1, padding: '8px 10px', fontSize: 13 }} value={mp.mp} onChange={e => setLiqMPs(prev => prev.map((x, j) => j === i ? { ...x, mp: e.target.value } : x))}>
                        <option value="">— Seleccionar —</option>
                        {metodosPago.filter(m => m.activo).map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                      </select>
                      <input className="input" type="text" placeholder="Monto" style={{ width: 130, textAlign: 'right', padding: '8px 10px', fontSize: 13 }} value={mp.monto ? new Intl.NumberFormat('es-CO').format(mp.monto) : ''} onChange={e => { const raw = e.target.value.replace(/\D/g, ''); setLiqMPs(prev => prev.map((x, j) => j === i ? { ...x, monto: raw } : x)); }} />
                      <button className="btn btn-danger btn-icon" style={{ width: 36, height: 36, padding: 0, background: 'rgba(239,68,68,0.1)' }} onClick={() => setLiqMPs(prev => prev.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 12, alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Cliente</label>
                    <input className="input" style={{ padding: '8px 12px' }} value={liqCliente} onChange={e => setLiqCliente(e.target.value)} />
                    
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Obs.</label>
                    <input className="input" style={{ padding: '8px 12px' }} placeholder="Observaciones..." value={liqObs} onChange={e => setLiqObs(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '12px 16px', borderRadius: 8, marginTop: 16, marginBottom: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {(() => {
                        const faltante = calcTotal() - liqMPs.reduce((acc, x) => acc + (parseFloat(x.monto) || 0), 0);
                        if (faltante > 0) return 'Faltante';
                        return 'Cambio / Vueltas';
                      })()}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: (() => {
                        const faltante = calcTotal() - liqMPs.reduce((acc, x) => acc + (parseFloat(x.monto) || 0), 0);
                        if (faltante > 0) return '#EF4444';
                        return '#10B981';
                      })() }}>
                      {(() => {
                        const faltante = calcTotal() - liqMPs.reduce((acc, x) => acc + (parseFloat(x.monto) || 0), 0);
                        if (faltante > 0) return fmt(-faltante);
                        return fmt(Math.abs(faltante));
                      })()}
                    </span>
                  </div>

                  <button className="btn btn-success btn-lg" style={{ width: '100%', fontSize: 15, fontWeight: 800, padding: 14, letterSpacing: '1px' }} onClick={liquidar} disabled={liquidando || (calcTotal() - liqMPs.reduce((acc, x) => acc + (parseFloat(x.monto) || 0), 0)) > 0}>
                    {liquidando ? 'Procesando...' : '✓ PAGAR Y LIQUIDAR'}
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
