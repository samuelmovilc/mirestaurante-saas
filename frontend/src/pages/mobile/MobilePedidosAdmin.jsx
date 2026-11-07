import { useState, useEffect, useRef } from 'react'
import { api, fmt, today } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'
import { downloadFacturaPDF, downloadComandasPDF } from '../../lib/pdfHelpers'

const EST_MAP = {
  pendiente:   { label: 'Pendiente',      cls: 'badge-gray'   },
  liquidado:   { label: 'Liquidado',      cls: 'badge-purple' },
  cancelado:   { label: 'Cancelado',      cls: 'badge-red'    },
}
const TIPO_LABEL = { mesa: 'Mesa', domicilio: 'Domicilio', venta_interna: 'Interna', credito: 'Crédito' }

export default function MobilePedidosAdmin() {
  const { toast, ToastContainer } = useToast()
  const [config, setConfig]           = useState({})
  const [pedidos, setPedidos]         = useState([])
  const [loading, setLoading]         = useState(true)
  
  // Data for dependencies
  const [metodosPago, setMetodosPago] = useState([])
  
  // Bottom Sheets State
  const [activeSheet, setActiveSheet] = useState(null) // 'filters', 'options', 'liquidar', 'edit'
  const [selPedido, setSelPedido]     = useState(null)
  
  // Filtros
  const [fTexto, setFTexto] = useState('')
  const [fFecha, setFFecha] = useState(today())
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('pendiente') // pendiente, liquidado, todas

  // Edición
  const [itemsEdit, setItemsEdit]     = useState([])
  const [obsEdit, setObsEdit]         = useState('')
  const [prodResults, setProdResults] = useState([])
  const prodSearchRef = useRef(null)
  const [guardando, setGuardando]     = useState(false)
  
  // Liquidación
  const [liqMPs, setLiqMPs]           = useState([{ mp: '', monto: '' }])
  const [liqCliente, setLiqCliente]   = useState('')
  const [liqObs, setLiqObs]           = useState('')
  const [liquidando, setLiquidando]   = useState(false)

  async function cargarPedidos(params = {}) {
    setLoading(true)
    try {
      const p = { fecha: fFecha, orden: 'desc', ...params }
      if (fTipo) p.tipo_pedido = fTipo
      const res = await api.getPedidos(p)
      let data = res.data || []
      if (fEstado !== 'todas') {
        data = data.filter(p => p.estado === fEstado)
      }
      setPedidos(data)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    cargarPedidos()
    api.getMetodosPago().then(r => setMetodosPago(r.data || [])).catch(() => {})
    api.getConfig().then(r => setConfig(r.data || {})).catch(() => {})
  }, [])

  function calcTotal() {
    return itemsEdit.reduce((s, it) => s + (parseFloat(it.precio_unitario) || 0) * (parseInt(it.cantidad) || 1), 0)
  }

  function abrirOpciones(ped) {
    const items = typeof ped.items === 'string' ? JSON.parse(ped.items || '[]') : (ped.items || [])
    setSelPedido(ped)
    setItemsEdit(items.map(it => ({ ...it })))
    setObsEdit(ped.observaciones || '')
    setLiqCliente(ped.nombre_cliente || '')
    setLiqObs(ped.observaciones || '')
    setLiqMPs([{ mp: '', monto: '' }])
    setActiveSheet('options')
  }

  // ==== IMPRESION & PDF ====
  function imprimirFactura(p) {
    downloadFacturaPDF(p, [], p.total, 0, config)
    setActiveSheet(null)
  }

  function imprimirComanda(p) {
    downloadComandasPDF([p], config)
    setActiveSheet(null)
  }

  function descargarFacturaPDFWrapper(p, mps=[], total=0, cambio=0) {
    downloadFacturaPDF(p, mps, total, cambio, config)
  }

  // ==== ACCIONES DE ESTADO ====
  async function anularPedido() {
    if (!window.confirm('¿Estás seguro de anular/cancelar este pedido?')) return
    try {
      await api.cambiarEstado(selPedido.id, 'cancelado')
      toast('Pedido anulado', 'success')
      setActiveSheet(null)
      cargarPedidos()
    } catch (e) { toast(e.message, 'error') }
  }

  // ==== EDICION ====
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
      setActiveSheet(null)
      cargarPedidos()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }

  // ==== LIQUIDACION ====
  function getTotalPagado() {
    return liqMPs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
  }

  async function procesarLiquidacion() {
    const mpsSel = liqMPs.filter(m => m.mp)
    if (!mpsSel.length) return toast('Selecciona al menos un método de pago', 'error')
    
    const total = calcTotal()
    let pagado = getTotalPagado()
    
    if (pagado < total) {
      return toast(`Falta por pagar: ${fmt(total - pagado)}`, 'error')
    }

    setLiquidando(true)
    try {
      let cambio = pagado - total
      let mpsConTipo = mpsSel.map(m => {
        const mpInfo = metodosPago.find(x => x.nombre === m.mp) || {}
        return { nombre: m.mp, tipo: mpInfo.tipo || 'efectivo', monto: parseFloat(m.monto) || 0 }
      })
      
      // Ajustar si el cliente dio billetes más grandes (vueltas) para no inflar la venta
      if (cambio > 0) {
        let ef = mpsConTipo.find(m => m.tipo === 'efectivo' && m.monto >= cambio)
        if (ef) {
          ef.monto -= cambio
        } else {
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
      
      // Auto-generar PDF de la factura si lo desean
      descargarFacturaPDFWrapper(selPedido, mpsConTipo, total, pagado - total)
      
      await api.cambiarEstado(selPedido.id, 'liquidado')
      toast(`Liquidado con éxito. (Folio: ${res.data?.folio || ''})`, 'success', 4000)
      setActiveSheet(null)
      cargarPedidos()
    } catch (e) { toast(e.message, 'error') }
    finally { setLiquidando(false) }
  }

  const txtLow = fTexto.toLowerCase().trim()
  const pedidosFiltrados = pedidos.filter(p => {
    if (!txtLow) return true
    const n = String(p.numero_pedido || '').toLowerCase()
    const c = String(p.nombre_cliente || '').toLowerCase()
    return n.includes(txtLow) || c.includes(txtLow)
  })

  return (
    <>
      <ToastContainer />
      <MobileTopBar title="Órdenes" rightAction={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mobile-icon-btn" onClick={() => setActiveSheet('filters')}>
             <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
          </button>
        </div>
      } />
      
      <div className="mobile-container">
        <input 
          className="input" 
          style={{ width: '100%', marginBottom: 16, padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }} 
          placeholder="Buscar # orden o cliente..."
          value={fTexto}
          onChange={e => setFTexto(e.target.value)}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pedidosFiltrados.map(p => {
              const d = new Date(p.created_at)
              const items = typeof p.items === 'string' ? JSON.parse(p.items || '[]') : (p.items || [])
              const totalItems = items.reduce((s, it) => s + parseInt(it.cantidad || 0), 0)
              
              return (
                <div key={p.id} style={{ 
                  background: 'white', padding: 16, borderRadius: 12, 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9',
                  display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 16, color: '#0f172a' }}>#{p.numero_pedido}</strong>
                        <span className={`badge ${EST_MAP[p.estado]?.cls || 'badge-gray'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                          {EST_MAP[p.estado]?.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>
                        {TIPO_LABEL[p.tipo_pedido]} • {p.mesa_nombre || 'Bar'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <strong style={{ fontSize: 16, color: '#3b82f6' }}>{fmt(p.total)}</strong>
                      <button className="mobile-icon-btn" style={{ padding: 4, background: '#f8fafc', borderRadius: '50%' }} onClick={() => abrirOpciones(p)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    <span>{p.nombre_cliente ? `Cliente: ${p.nombre_cliente}` : `${totalItems} productos`}</span>
                    <span>{d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )
            })}
            
            {pedidosFiltrados.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No se encontraron órdenes</div>
            )}
          </div>
        )}
      </div>

      {/* OVERLAY PARA TODOS LOS BOTTOM SHEETS */}
      {activeSheet && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setActiveSheet(null)}>
          
          <div style={{ 
            background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '24px 20px', maxHeight: '90vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 16
          }} onClick={e => e.stopPropagation()}>
            
            {/* CABECERA BOTTOM SHEET */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {activeSheet === 'options' && <h3 style={{ margin: 0, fontSize: 18 }}>Opciones #{selPedido?.numero_pedido}</h3>}
                {activeSheet === 'filters' && <h3 style={{ margin: 0, fontSize: 18 }}>Filtros</h3>}
                {activeSheet === 'edit' && <h3 style={{ margin: 0, fontSize: 18 }}>Editar Pedido</h3>}
                {activeSheet === 'liquidar' && <h3 style={{ margin: 0, fontSize: 18 }}>Liquidar Venta</h3>}
              </div>
              <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setActiveSheet(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* ==== SHEET: OPCIONES ==== */}
            {activeSheet === 'options' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selPedido.estado === 'pendiente' && (
                  <>
                    <button className="btn" style={{ justifyContent: 'flex-start', background: '#3b82f6', color: 'white' }} onClick={() => setActiveSheet('liquidar')}>
                      💰 Pagar y Liquidar
                    </button>
                    <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', background: '#f1f5f9' }} onClick={() => setActiveSheet('edit')}>
                      ✏️ Editar Pedido
                    </button>
                  </>
                )}
                
                <div style={{ borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />
                
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', background: '#f8fafc' }} onClick={() => imprimirComanda(selPedido)}>
                  👨‍🍳 Imprimir Comanda (Cocina)
                </button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', background: '#f8fafc' }} onClick={() => imprimirFactura(selPedido)}>
                  🖨️ Imprimir Factura (Ticket)
                </button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', background: '#f8fafc' }} onClick={() => descargarFacturaPDFWrapper(selPedido, [], selPedido.total, 0)}>
                  📄 Descargar Factura (PDF)
                </button>

                {selPedido.estado === 'pendiente' && (
                  <>
                    <div style={{ borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />
                    <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: '#ef4444', background: '#fef2f2' }} onClick={anularPedido}>
                      🗑️ Cancelar/Anular Pedido
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ==== SHEET: FILTROS ==== */}
            {activeSheet === 'filters' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="label">Fecha</label>
                  <input type="date" className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={fFecha} onChange={e => setFFecha(e.target.value)} />
                </div>
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={fTipo} onChange={e => setFTipo(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="mesa">Mesa</option>
                    <option value="domicilio">Domicilio</option>
                    <option value="venta_interna">Interna</option>
                    <option value="credito">Crédito</option>
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={fEstado} onChange={e => setFEstado(e.target.value)}>
                    <option value="todas">Todas</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="liquidado">Liquidado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 12, padding: 16 }} onClick={() => { setActiveSheet(null); cargarPedidos(); }}>
                  Aplicar Filtros
                </button>
              </div>
            )}

            {/* ==== SHEET: EDITAR PEDIDO ==== */}
            {activeSheet === 'edit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <input 
                    ref={prodSearchRef}
                    className="input" 
                    placeholder="🔍 Buscar para agregar producto..." 
                    style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #3b82f6' }}
                    onChange={e => buscarProducto(e.target.value)} 
                  />
                  {prodResults.length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4 }}>
                      {prodResults.map(pr => (
                        <div key={pr.id} style={{ padding: 12, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }} onClick={() => agregarProducto(pr)}>
                          <span>{pr.nombre}</span>
                          <span style={{ color: '#3b82f6', fontWeight: 600 }}>{fmt(pr.precio_venta)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ maxHeight: '40vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {itemsEdit.map((it, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 14 }}>{it.nombre_producto}</strong>
                        <button className="btn btn-ghost btn-xs" style={{ color: '#ef4444' }} onClick={() => quitarItem(idx)}>Quitar</button>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="number" className="input" style={{ width: 60, padding: 8 }} value={it.cantidad} onChange={e => updItem(idx, 'cantidad', e.target.value)} />
                        <input type="number" className="input" style={{ flex: 1, padding: 8 }} value={it.precio_unitario} onChange={e => updItem(idx, 'precio_unitario', e.target.value)} />
                      </div>
                    </div>
                  ))}
                  {itemsEdit.length === 0 && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>No hay productos</div>}
                </div>

                <div>
                  <label className="label">Observaciones</label>
                  <textarea className="input" style={{ width: '100%', borderRadius: 12, padding: 12 }} rows={2} value={obsEdit} onChange={e => setObsEdit(e.target.value)} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: 18, marginTop: 8 }}>
                  <span>TOTAL:</span>
                  <span style={{ color: '#3b82f6' }}>{fmt(calcTotal())}</span>
                </div>

                <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12 }} onClick={actualizarPedido} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            )}

            {/* ==== SHEET: LIQUIDAR ==== */}
            {activeSheet === 'liquidar' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ textAlign: 'center', background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>TOTAL A PAGAR</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a' }}>{fmt(calcTotal())}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label className="label" style={{ marginBottom: 0 }}>MÉTODOS DE PAGO</label>
                  {liqMPs.map((m, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8 }}>
                      <select className="input" style={{ flex: 1, padding: 12, borderRadius: 12, background: '#f8fafc' }} value={m.mp} onChange={e => {
                        const newMps = [...liqMPs]
                        newMps[idx].mp = e.target.value
                        setLiqMPs(newMps)
                      }}>
                        <option value="">Seleccione...</option>
                        {metodosPago.map(mp => <option key={mp.id} value={mp.nombre}>{mp.nombre}</option>)}
                      </select>
                      <input className="input" type="number" style={{ width: 120, padding: 12, borderRadius: 12 }} value={m.monto} onChange={e => {
                        const newMps = [...liqMPs]
                        newMps[idx].monto = e.target.value
                        setLiqMPs(newMps)
                      }} />
                      {liqMPs.length > 1 && (
                        <button className="mobile-icon-btn" style={{ padding: '0 12px', background: '#fef2f2', color: '#ef4444', borderRadius: 12 }} onClick={() => {
                          const newMps = liqMPs.filter((_, i) => i !== idx)
                          setLiqMPs(newMps)
                        }}>
                          X
                        </button>
                      )}
                    </div>
                  ))}
                  
                  <button className="btn btn-ghost" style={{ color: '#3b82f6', background: '#eff6ff', alignSelf: 'flex-start', borderRadius: 8, padding: '8px 16px' }} onClick={() => setLiqMPs([...liqMPs, { mp: '', monto: calcTotal() - getTotalPagado() }])}>
                    + Añadir otro pago
                  </button>
                </div>

                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>Pagado: {fmt(getTotalPagado())}</span>
                  {getTotalPagado() > calcTotal() && (
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                      Cambio: {fmt(getTotalPagado() - calcTotal())}
                    </span>
                  )}
                  {getTotalPagado() < calcTotal() && (
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                      Falta: {fmt(calcTotal() - getTotalPagado())}
                    </span>
                  )}
                </div>

                <button 
                  className="btn" 
                  style={{ width: '100%', padding: 16, borderRadius: 12, background: '#3b82f6', color: 'white', fontWeight: 700, fontSize: 16, marginTop: 8 }}
                  onClick={procesarLiquidacion}
                  disabled={liquidando || getTotalPagado() < calcTotal()}
                >
                  {liquidando ? 'Procesando...' : 'Confirmar Liquidación'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
