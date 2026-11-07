import { useState, useEffect } from 'react'
import { api, fmt, fmtF } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'

export default function MobileCarteraAdmin() {
  const { toast, ToastContainer } = useToast()
  
  const [data, setData]       = useState([])
  const [stats, setStats]     = useState({})
  const [loading, setLoading] = useState(true)

  // Filtros
  const [activeSheet, setActiveSheet] = useState(null) // 'filters', 'pagos'
  const [fFD, setFFD]   = useState('2026-01-01')
  const [fFH, setFFH]   = useState('2026-12-31')
  const [fTrab, setFTrab] = useState('')
  const [fEst, setFEst] = useState('')

  // Pagos (Abonos)
  const [pagosModal, setPagosModal]   = useState(null)
  const [pagosList, setPagosList]     = useState([])
  const [pagosInfo, setPagosInfo]     = useState({})
  const [abono, setAbono]             = useState({ fecha_pago: '', metodo: 'Efectivo', referencia: '', monto: '' })
  const [guardandoAbono, setGuardandoAbono] = useState(false)

  async function buscar() {
    setLoading(true)
    try {
      const params = { fecha_del: fFD, fecha_al: fFH }
      if (fTrab) params.trabajador_nombre = fTrab
      if (fEst)  params.estado = fEst
      const res = await api.getCartera(params)
      setData(res.data || [])
      setStats(res.stats || {})
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { buscar() }, [])

  async function abrirPagos(cuenta) {
    setPagosModal(cuenta)
    setActiveSheet('pagos')
    try {
      const res = await api.getPagos(cuenta.id)
      setPagosList(res.data.pagos || [])
      setPagosInfo(res.data)
      setAbono({ fecha_pago: new Date().toISOString().split('T')[0], metodo: 'Efectivo', referencia: '', monto: '' })
    } catch(e) { toast(e.message, 'error') }
  }

  async function registrarAbono() {
    if (!abono.monto || !abono.fecha_pago) return toast('Fecha y monto requeridos', 'error')
    setGuardandoAbono(true)
    try {
      await api.registrarAbono(pagosModal.id, { ...abono, monto: parseFloat(abono.monto) })
      toast('Abono registrado', 'success')
      const res = await api.getPagos(pagosModal.id)
      setPagosList(res.data.pagos || [])
      setPagosInfo(res.data)
      setAbono(a => ({ ...a, monto: '', referencia: '' }))
      buscar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardandoAbono(false) }
  }

  async function eliminarPago(pagoId) {
    if (!window.confirm('¿Eliminar este pago?')) return
    try {
      await api.eliminarPago(pagoId)
      const res = await api.getPagos(pagosModal.id)
      setPagosList(res.data.pagos || [])
      setPagosInfo(res.data)
      buscar()
      toast('Pago eliminado')
    } catch (e) { toast(e.message, 'error') }
  }

  async function pazSalvo() {
    try {
      const res = await api.getPazSalvo(fTrab)
      window.alert(`Paz y Salvo\n\nTrabajador: ${res.data.trabajador}\nTotal deuda: ${fmt(res.data.total_deuda)}\nTotal pagado: ${fmt(res.data.total_pagado)}\nEstado: ${res.data.estado}\nFecha: ${res.data.fecha_paz_salvo}`)
    } catch (e) { toast(e.message, 'error') }
  }

  const psPosible = fTrab && parseFloat(stats.pendiente_cobro || 1) <= 0

  return (
    <>
      <ToastContainer />
      <MobileTopBar title="Cartera" rightAction={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mobile-icon-btn" style={{ color: psPosible ? '#3b82f6' : '#94a3b8' }} onClick={() => psPosible ? pazSalvo() : toast('Solo disponible cuando el saldo es 0 y hay un trabajador filtrado')}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </button>
          <button className="mobile-icon-btn" onClick={() => setActiveSheet('filters')}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
          </button>
        </div>
      } />

      <div className="mobile-container">
        
        {/* STATS */}
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, minWidth: 140, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TOTAL CARTERA</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{fmt(stats.total_cartera)}</div>
          </div>
          <div style={{ background: '#eff6ff', padding: 16, borderRadius: 12, minWidth: 140, border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>TOTAL PAGADO</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>{fmt(stats.total_pagado)}</div>
          </div>
          <div style={{ background: '#fef2f2', padding: 16, borderRadius: 12, minWidth: 140, border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>PENDIENTE</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c' }}>{fmt(stats.pendiente_cobro)}</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.map(c => (
              <div key={c.id} style={{ 
                background: 'white', padding: 16, borderRadius: 12, 
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{c.trabajador_nombre}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Pedido #{c.pedido_numero} • {fmtF(c.fecha_venta)}</div>
                  </div>
                  <span className={`badge ${c.estado_final === 'ALDIA' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                    {c.estado_final === 'ALDIA' ? 'AL DÍA' : 'SALDO'}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: '#475569', marginBottom: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.items_descripcion}
                </div>

                <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 12 }}>
                  <div>Total: <strong>{fmt(c.total)}</strong></div>
                  <div>Debe: <strong style={{ color: parseFloat(c.pendiente) > 0 ? '#ef4444' : '#10b981' }}>{fmt(c.pendiente)}</strong></div>
                </div>

                <button className="btn" style={{ width: '100%', padding: '10px', background: '#eff6ff', color: '#3b82f6', borderRadius: 8, fontSize: 14 }} onClick={() => abrirPagos(c)}>
                  Gestionar Pagos
                </button>
              </div>
            ))}
            
            {data.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No hay cuentas pendientes</div>
            )}
          </div>
        )}
      </div>

      {/* OVERLAY PARA BOTTOM SHEETS */}
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
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {activeSheet === 'filters' && <h3 style={{ margin: 0, fontSize: 18 }}>Filtros de Cartera</h3>}
                {activeSheet === 'pagos' && <h3 style={{ margin: 0, fontSize: 18 }}>Pagos: {pagosModal?.trabajador_nombre}</h3>}
              </div>
              <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setActiveSheet(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* FILTROS */}
            {activeSheet === 'filters' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">Desde</label>
                    <input type="date" className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={fFD} onChange={e => setFFD(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label">Hasta</label>
                    <input type="date" className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={fFH} onChange={e => setFFH(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Trabajador</label>
                  <input type="text" className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} placeholder="Nombre exacto o parcial" value={fTrab} onChange={e => setFTrab(e.target.value)} />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={fEst} onChange={e => setFEst(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="SALDO">Con saldo pendiente</option>
                    <option value="ALDIA">Al día</option>
                  </select>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 12, padding: 16 }} onClick={() => { setActiveSheet(null); buscar(); }}>
                  Aplicar Filtros
                </button>
              </div>
            )}

            {/* PAGOS / ABONOS */}
            {activeSheet === 'pagos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Resumen */}
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', padding: 16, borderRadius: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Pagado</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{fmt(pagosInfo.total_pagado)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Total</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(pagosInfo.cuenta?.total)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Pendiente</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{fmt(pagosInfo.pendiente)}</div>
                  </div>
                </div>

                {/* Nuevo Abono */}
                <div style={{ background: '#eff6ff', padding: 16, borderRadius: 12, border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', marginBottom: 12 }}>Registrar nuevo abono</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="date" className="input" style={{ flex: 1, padding: 10, borderRadius: 8 }} value={abono.fecha_pago} onChange={e => setAbono({...abono, fecha_pago: e.target.value})} />
                    <select className="input" style={{ flex: 1, padding: 10, borderRadius: 8 }} value={abono.metodo} onChange={e => setAbono({...abono, metodo: e.target.value})}>
                      <option>Efectivo</option><option>Transferencia</option><option>Nequi</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input type="text" className="input" style={{ flex: 1, padding: 10, borderRadius: 8 }} placeholder="Ref (opcional)" value={abono.referencia} onChange={e => setAbono({...abono, referencia: e.target.value})} />
                    <input type="number" className="input" style={{ flex: 1, padding: 10, borderRadius: 8 }} placeholder="Monto $" value={abono.monto} onChange={e => setAbono({...abono, monto: e.target.value})} />
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', padding: 12, borderRadius: 8 }} onClick={registrarAbono} disabled={guardandoAbono}>
                    {guardandoAbono ? 'Guardando...' : 'Guardar Abono'}
                  </button>
                </div>

                {/* Historial de Pagos */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Historial de pagos</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pagosList.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(p.monto)}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{fmtF(p.fecha_pago)} • {p.metodo} {p.referencia ? `(${p.referencia})` : ''}</div>
                        </div>
                        <button className="mobile-icon-btn" style={{ padding: 6, background: '#fef2f2', color: '#ef4444', borderRadius: 8 }} onClick={() => eliminarPago(p.id)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    ))}
                    {pagosList.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 16 }}>No hay pagos registrados</div>}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
