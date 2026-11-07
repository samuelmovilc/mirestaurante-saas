import { useState, useEffect } from 'react'
import { api, fmt, fmtF } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

export default function CarteraAdmin() {
  const { toast, ToastContainer } = useToast()
  const [data, setData]       = useState([])
  const [stats, setStats]     = useState({})
  const [loading, setLoading] = useState(true)
  const [pagosModal, setPagosModal]   = useState(null)
  const [pagosList, setPagosList]     = useState([])
  const [pagosInfo, setPagosInfo]     = useState({})
  const [abono, setAbono]             = useState({ fecha_pago: '', metodo: 'Efectivo', referencia: '', monto: '' })

  const [fFD, setFFD]   = useState('2026-01-01')
  const [fFH, setFFH]   = useState('2026-12-31')
  const [fTrab, setFTrab] = useState('')
  const [fEst, setFEst] = useState('')

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
    const res = await api.getPagos(cuenta.id)
    setPagosList(res.data.pagos || [])
    setPagosInfo(res.data)
    setAbono({ fecha_pago: new Date().toISOString().split('T')[0], metodo: 'Efectivo', referencia: '', monto: '' })
  }

  async function registrarAbono() {
    if (!abono.monto || !abono.fecha_pago) return toast('Fecha y monto requeridos', 'error')
    try {
      await api.registrarAbono(pagosModal.id, { ...abono, monto: parseFloat(abono.monto) })
      toast('Abono registrado')
      const res = await api.getPagos(pagosModal.id)
      setPagosList(res.data.pagos || [])
      setPagosInfo(res.data)
      setAbono(a => ({ ...a, monto: '', referencia: '' }))
      buscar()
    } catch (e) { toast(e.message, 'error') }
  }

  async function eliminarPago(pagoId) {
    if (!confirm('¿Eliminar este pago?')) return
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
      alert(`Paz y Salvo\n\nTrabajador: ${res.data.trabajador}\nTotal deuda: ${fmt(res.data.total_deuda)}\nTotal pagado: ${fmt(res.data.total_pagado)}\nEstado: ${res.data.estado}\nFecha: ${res.data.fecha_paz_salvo}`)
    } catch (e) { toast(e.message, 'error') }
  }

  const psPosible = fTrab && parseFloat(stats.pendiente_cobro || 1) <= 0

  return (
    <div>
      <ToastContainer />
      <div className="page-header">
        <div><h2>Cartera</h2><p>Cuentas por cobrar — pedidos en crédito de trabajadores.</p></div>
        <div className="page-actions">
          <button className="btn btn-ghost" disabled={!psPosible} onClick={pazSalvo} title={!psPosible ? 'Solo disponible cuando el saldo pendiente es $0' : ''}>
            Paz y salvo
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Fecha del</label>
          <input className="filter-input" type="date" value={fFD} onChange={e => setFFD(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Fecha al</label>
          <input className="filter-input" type="date" value={fFH} onChange={e => setFFH(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Trabajador</label>
          <input className="filter-input" placeholder="Nombre..." value={fTrab} onChange={e => setFTrab(e.target.value)} style={{ width: 160 }} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Estado</label>
          <select className="filter-input" value={fEst} onChange={e => setFEst(e.target.value)}>
            <option value="">Todos</option>
            <option value="SALDO">Con saldo pendiente</option>
            <option value="ALDIA">Al día</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={buscar}>Buscar</button>
      </div>

      {/* STATS */}
      <div className="stats-grid stats-3" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-label">Total cartera</div>
          <div className="stat-value">{fmt(stats.total_cartera)}</div>
          <div className="stat-sub">{stats.trabajadores_count} trabajador{stats.trabajadores_count !== 1 ? 'es' : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total pagado</div>
          <div className="stat-value vd">{fmt(stats.total_pagado)}</div>
          <div className="stat-sub vd">Abonos recibidos</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pendiente de cobro</div>
          <div className="stat-value rd">{fmt(stats.pendiente_cobro)}</div>
          <div className="stat-sub rd">Por quincena</div>
        </div>
      </div>

      {/* TABLA EXCEL */}
      <div className="car-table-wrap">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <table className="car-table">
            <thead>
              <tr>
                <th>#</th><th>Pagos</th><th>ID Pedido</th><th>Nombre</th>
                <th>Fecha venta</th><th>Productos</th><th>Total venta</th>
                <th>Pendiente</th><th>Pagado</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text3)', fontWeight: 700 }}>{i + 1}</td>
                  <td><button className="btn btn-ghost btn-xs" onClick={() => abrirPagos(c)}>Ver pagos</button></td>
                  <td style={{ fontWeight: 700, color: 'var(--az)' }}>{c.pedido_numero || '—'}</td>
                  <td><strong>{c.trabajador_nombre}</strong></td>
                  <td style={{ fontSize: 12 }}>{fmtF(c.fecha_venta)}</td>
                  <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text3)' }}>{c.items_descripcion || '—'}</td>
                  <td><strong>{fmt(c.total)}</strong></td>
                  <td className={parseFloat(c.pendiente) > 0 ? 'saldo' : 'aldia'}>{fmt(c.pendiente)}</td>
                  <td className="aldia">{fmt(c.pagado)}</td>
                  <td><span className={`badge ${c.estado_final === 'ALDIA' ? 'badge-green' : 'badge-red'}`}>{c.estado_final === 'ALDIA' ? 'AL DÍA' : 'SALDO'}</span></td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan="10" style={{ textAlign: 'center', padding: 28, color: 'var(--text3)', fontSize: 13 }}>Sin registros</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL PAGOS */}
      {pagosModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPagosModal(null)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <h3>Pagos — {pagosModal.trabajador_nombre} ({pagosModal.pedido_numero})</h3>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr><th>Ref.</th><th>Fecha</th><th>Método</th><th>Referencia</th><th style={{ textAlign: 'right' }}>Monto</th><th></th></tr>
                </thead>
                <tbody>
                  {pagosList.length ? pagosList.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 11 }}>{p.id}</td>
                      <td style={{ fontSize: 12 }}>{fmtF(p.fecha_pago)}</td>
                      <td style={{ fontSize: 12 }}>{p.metodo}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{p.referencia || '—'}</td>
                      <td style={{ fontWeight: 700, textAlign: 'right' }}>{fmt(p.monto)}</td>
                      <td><button className="btn btn-danger btn-xs" onClick={() => eliminarPago(p.id)}>Eliminar</button></td>
                    </tr>
                  )) : (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: 12, color: 'var(--text3)', fontSize: 12 }}>Sin pagos registrados</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* NUEVO ABONO */}
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14, border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>Registrar nuevo abono</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Fecha</label><input className="input" type="date" value={abono.fecha_pago} onChange={e => setAbono(a => ({ ...a, fecha_pago: e.target.value }))} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Método</label><select className="select" value={abono.metodo} onChange={e => setAbono(a => ({ ...a, metodo: e.target.value }))}><option>Efectivo</option><option>Transferencia</option><option>Nequi</option></select></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Referencia</label><input className="input" value={abono.referencia} onChange={e => setAbono(a => ({ ...a, referencia: e.target.value }))} placeholder="Opcional" /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Monto</label><input className="input" type="number" value={abono.monto} onChange={e => setAbono(a => ({ ...a, monto: e.target.value }))} placeholder="0" /></div>
              </div>
              <button className="btn btn-success btn-sm" style={{ marginTop: 10 }} onClick={registrarAbono}>Registrar abono</button>
            </div>

            {/* TOTALES */}
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center', border: '1px solid var(--border)' }}>
              <div><div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>TOTAL PAGADO</div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--vd)' }}>{fmt(pagosInfo.total_pagado)}</div></div>
              <div><div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>TOTAL A PAGAR</div><div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(pagosInfo.cuenta?.total)}</div></div>
              <div><div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>PENDIENTE</div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--rd)' }}>{fmt(pagosInfo.pendiente)}</div></div>
            </div>

            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setPagosModal(null)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
