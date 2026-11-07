import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { api, fmt, fmtF } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { downloadCuadrePDF } from '../../lib/pdfHelpers'

export default function CajaAdmin() {
  const { toast, ToastContainer } = useToast()
  
  const [activeTab, setActiveTab] = useState('operacion') // 'operacion' | 'historico'
  const [loading, setLoading] = useState(true)
  
  // Estado Turno
  const [turno, setTurno] = useState(null)
  const [ventasTurno, setVentasTurno] = useState([])
  const [gastosTurno, setGastosTurno] = useState([])
  
  // Estado Histórico
  const [historico, setHistorico] = useState([])

  // Modal Abrir Caja
  const [showAbrir, setShowAbrir] = useState(false)
  const [metodosPago, setMetodosPago] = useState([])
  const [saldoInicial, setSaldoInicial] = useState('')

  // Modal Gasto
  const [showGasto, setShowGasto] = useState(false)
  const [gastoForm, setGastoForm] = useState({ categoria: '', observacion: '', metodo_pago: '', monto: '' })
  const [categoriasGastos, setCategoriasGastos] = useState(() => {
    const saved = localStorage.getItem('categorias_gastos')
    return saved ? JSON.parse(saved) : ['Insumos', 'Aseo', 'Pago Proveedor', 'Transporte', 'Servicios']
  })

  function agregarCategoria() {
    const cat = prompt('Ingrese el nombre de la nueva categoría:')
    if (cat && cat.trim()) {
      const updated = [...categoriasGastos, cat.trim()]
      setCategoriasGastos(updated)
      localStorage.setItem('categorias_gastos', JSON.stringify(updated))
      setGastoForm(f => ({ ...f, categoria: cat.trim() }))
    }
  }

  async function cargarTodo() {
    setLoading(true)
    try {
      const [tRes, hRes, mRes] = await Promise.all([
        api.getTurnoAbierto(),
        api.getHistoricoCajas(),
        api.getMetodosPago()
      ])
      
      const turnoActual = tRes.data
      setTurno(turnoActual)
      setHistorico(hRes.data || [])
      
      const mps = Array.isArray(mRes) ? mRes : (mRes?.data || [])
      setMetodosPago(mps)
      
      // Se simplifica: no se inicializan métodos de pago para saldoInicial porque ahora es un campo único

      if (turnoActual) {
        const [vRes, gRes] = await Promise.all([
          // Obtenemos ventas filtradas desde backend que tengan este turno_id
          api.getVentas({ turno_id: turnoActual.id }),
          api.getGastos(turnoActual.id)
        ])
        setVentasTurno(vRes.data || [])
        setGastosTurno(gRes.data || [])
      } else {
        setVentasTurno([])
        setGastosTurno([])
      }
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }

  useEffect(() => { cargarTodo() }, [])

  // ================= ABRIR CAJA =================
  async function confirmarApertura(e) {
    e.preventDefault()
    try {
      const data = {
        saldos: [{ metodo_pago: 'Efectivo', monto: parseFloat(saldoInicial) || 0 }]
      }
      await api.abrirCaja(data)
      toast('Caja abierta correctamente', 'success')
      setShowAbrir(false)
      setSaldoInicial('')
      cargarTodo()
    } catch(e) {
      toast(e.message, 'error')
    }
  }

  function renderModalAbrir() {
    if (!showAbrir) return null
    
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'none' }}>
        <div className="modal-content" style={{ maxWidth: 650, background: '#fff', color: '#000', borderRadius: 12, padding: '24px 32px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
             <h3 style={{ margin: 0, fontSize: 20, color: '#111', fontWeight: 500 }}>Aperturar Caja</h3>
             <button type="button" onClick={() => setShowAbrir(false)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' }}>&times;</button>
          </div>
          
          <form onSubmit={confirmarApertura}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label" style={{ fontWeight: 500, marginBottom: 8, display: 'block', color: '#333' }}>Vendedor</label>
                <select className="select" disabled style={{ background: '#f8f9fa', color: '#333', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', width: '100%' }}>
                  <option>Administrador</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label" style={{ fontWeight: 500, marginBottom: 8, display: 'block', color: '#333' }}>Saldo inicial</label>
                <input 
                  type="number" 
                  className="input" 
                  placeholder="0"
                  value={saldoInicial}
                  onChange={e => setSaldoInicial(e.target.value)}
                  style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#333', borderRadius: 8, padding: '10px 14px', width: '100%' }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="btn" onClick={() => setShowAbrir(false)} style={{ background: '#fff', color: '#333', border: '1px solid #e2e8f0', padding: '10px 24px', borderRadius: 8 }}>Cancelar</button>
              <button type="submit" className="btn" style={{ background: '#0f172a', color: '#fff', padding: '10px 24px', borderRadius: 8, border: 'none' }}>Guardar</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ================= REGISTRAR GASTO =================
  async function confirmarGasto(e) {
    e.preventDefault()
    if (!gastoForm.categoria || !gastoForm.monto || !gastoForm.metodo_pago) {
      return toast('Por favor completa todos los campos requeridos', 'error')
    }
    try {
      await api.crearGasto({ ...gastoForm, monto: parseFloat(gastoForm.monto) })
      toast('Gasto registrado', 'success')
      setShowGasto(false)
      setGastoForm({ categoria: '', observacion: '', metodo_pago: '', monto: '' })
      cargarTodo()
    } catch(e) {
      toast(e.message, 'error')
    }
  }

  function renderModalGasto() {
    if (!showGasto) return null
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'none' }}>
        <div className="modal-content" style={{ maxWidth: 450, background: '#fff', color: '#000', borderRadius: 12, padding: '24px 32px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
             <h3 style={{ margin: 0, fontSize: 20, color: '#111', fontWeight: 500 }}>Registrar Gasto del Turno</h3>
             <button type="button" onClick={() => setShowGasto(false)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' }}>&times;</button>
          </div>
          <form onSubmit={confirmarGasto}>
              <div className="form-group">
                <label className="label" style={{ fontWeight: 500, marginBottom: 8, display: 'block', color: '#333' }}>Categoría</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="select" value={gastoForm.categoria} onChange={e => setGastoForm(f => ({ ...f, categoria: e.target.value }))} required style={{ background: '#fff', color: '#333', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', flex: 1 }}>
                    <option value="">Seleccione Categoría...</option>
                    {categoriasGastos.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                  <button type="button" onClick={agregarCategoria} className="btn btn-primary" style={{ padding: '0 16px', borderRadius: 8, fontSize: 20 }}>+</button>
                </div>
              </div>
            <div className="form-group">
              <label className="label" style={{ fontWeight: 500, marginBottom: 8, display: 'block', color: '#333' }}>Observación</label>
              <input type="text" className="input" placeholder="Detalles (Ej. Vasos y servilletas)" value={gastoForm.observacion} onChange={e => setGastoForm(f => ({ ...f, observacion: e.target.value }))} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#333', borderRadius: 8, padding: '10px 14px', width: '100%' }} />
            </div>
            <div className="form-group">
              <label className="label" style={{ fontWeight: 500, marginBottom: 8, display: 'block', color: '#333' }}>Método de Pago</label>
              <select className="select" value={gastoForm.metodo_pago} onChange={e => setGastoForm(f => ({ ...f, metodo_pago: e.target.value }))} required style={{ background: '#fff', color: '#333', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', width: '100%' }}>
                <option value="">Selecciona...</option>
                {metodosPago.map(m => (
                  <option key={m.id} value={m.nombre}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label" style={{ fontWeight: 500, marginBottom: 8, display: 'block', color: '#333' }}>Monto</label>
              <input type="number" className="input" placeholder="0" value={gastoForm.monto} onChange={e => setGastoForm(f => ({ ...f, monto: e.target.value }))} required style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#333', borderRadius: 8, padding: '10px 14px', width: '100%' }} />
            </div>

            <div className="modal-actions" style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="btn" onClick={() => setShowGasto(false)} style={{ background: '#fff', color: '#333', border: '1px solid #e2e8f0', padding: '10px 24px', borderRadius: 8 }}>Cancelar</button>
              <button type="submit" className="btn btn-danger" style={{ padding: '10px 24px', borderRadius: 8 }}>Guardar Gasto</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ================= CERRAR CAJA =================
  async function handleCerrarCaja() {
    if (!confirm('¿Estás seguro de cerrar la caja actual? No podrás registrar más ventas ni gastos en este turno.')) return
    try {
      await api.cerrarCaja()
      toast('Caja cerrada exitosamente', 'success')
      cargarTodo()
    } catch(e) {
      toast(e.message, 'error')
    }
  }

  // ================= IMPRIMIR TIRILLA =================
  function imprimirCuadre(h) {
    downloadCuadrePDF(h, {})
  }

  // ================= UTILS =================
  async function anularVenta(id, folio) {
    if (!confirm(`¿Anular la venta ${folio}?`)) return
    try {
      await api.anularVenta(id)
      toast('Venta anulada')
      cargarTodo()
    } catch (e) { toast(e.message, 'error') }
  }

  // ================= RENDER =================
  if (loading && !turno) {
    return <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  }

  const saldoActual = turno ? (parseFloat(turno.saldo_inicial) + parseFloat(turno.ingresos) - parseFloat(turno.gastos)) : 0

  return (
    <div>
      <ToastContainer />
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>Sistema de Caja</h2>
          <p style={{ color: 'var(--text3)' }}>Control de turnos, ingresos y gastos operativos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${activeTab === 'operacion' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('operacion')}>Operación</button>
          <button className={`btn ${activeTab === 'historico' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('historico')}>Historial de Cierres</button>
        </div>
      </div>

      {activeTab === 'operacion' && (
        <div className="card" style={{ padding: 24 }}>
          {!turno ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <h3 style={{ marginBottom: 8 }}>CAJA CERRADA</h3>
              <p style={{ color: 'var(--text3)', marginBottom: 24 }}>No hay ningún turno abierto. Debes abrir la caja para poder registrar ventas y gastos.</p>
              <button className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 16 }} onClick={() => setShowAbrir(true)}>ABRIR CAJA</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--vd)', margin: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--vd)', display: 'inline-block' }}></span>
                    CAJA ABIERTA
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
                    Abierta el: {new Date(turno.fecha_apertura).toLocaleString('es-CO')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-success" onClick={() => setShowGasto(true)}>REGISTRAR GASTO</button>
                  <button className="btn btn-danger" onClick={handleCerrarCaja}>CERRAR CAJA</button>
                </div>
              </div>

              {/* STATS TURNO */}
              <div className="stats-grid stats-4" style={{ marginBottom: 32 }}>
                <div className="stat-card" style={{ background: 'var(--bg-page)' }}>
                  <div className="stat-label">Saldo Inicial (Base)</div>
                  <div className="stat-value">{fmt(turno.saldo_inicial)}</div>
                </div>
                <div className="stat-card" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }}>
                  <div className="stat-label" style={{ color: 'var(--vd)' }}>+ Ingresos (Ventas)</div>
                  <div className="stat-value" style={{ color: 'var(--vd)' }}>{fmt(turno.ingresos)}</div>
                </div>
                <div className="stat-card" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
                  <div className="stat-label" style={{ color: 'var(--red)' }}>- Gastos (Egresos)</div>
                  <div className="stat-value" style={{ color: 'var(--red)' }}>{fmt(turno.gastos)}</div>
                </div>
                <div className="stat-card" style={{ border: '2px solid var(--az)', background: 'var(--bg-page)' }}>
                  <div className="stat-label" style={{ fontWeight: 700 }}>= SALDO ACTUAL</div>
                  <div className="stat-value" style={{ color: 'var(--az)' }}>{fmt(saldoActual)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
                {/* LISTA GASTOS */}
                <div>
                  <h4 style={{ marginBottom: 12 }}>Gastos Registrados ({gastosTurno.length})</h4>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ margin: 0 }}>
                      <thead style={{ background: 'var(--bg-page)' }}>
                        <tr>
                          <th style={{ fontSize: 12, padding: 8 }}>Categoría / Obs</th>
                          <th style={{ fontSize: 12, padding: 8 }}>Método</th>
                          <th style={{ fontSize: 12, padding: 8, textAlign: 'right' }}>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastosTurno.map(g => (
                          <tr key={g.id}>
                            <td style={{ fontSize: 12, padding: 8 }}>
                              <strong>{g.categoria}</strong><br/>
                              <span style={{ color: 'var(--text3)' }}>{g.observacion}</span>
                            </td>
                            <td style={{ fontSize: 12, padding: 8 }}>{g.metodo_pago}</td>
                            <td style={{ fontSize: 12, padding: 8, textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>- {fmt(g.monto)}</td>
                          </tr>
                        ))}
                        {gastosTurno.length === 0 && <tr><td colSpan="3" style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>No hay gastos en este turno</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* LISTA VENTAS (RESUMEN) */}
                <div>
                  <h4 style={{ marginBottom: 12 }}>Ventas Registradas ({ventasTurno.length})</h4>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
                    <table style={{ margin: 0 }}>
                      <thead style={{ background: 'var(--bg-page)' }}>
                        <tr>
                          <th style={{ fontSize: 12, padding: 8 }}>Hora</th>
                          <th style={{ fontSize: 12, padding: 8 }}>Folio</th>
                          <th style={{ fontSize: 12, padding: 8, textAlign: 'right' }}>Monto</th>
                          <th style={{ fontSize: 12, padding: 8, textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ventasTurno.map(v => (
                          <tr key={v.id}>
                            <td style={{ fontSize: 12, padding: 8, color: 'var(--text3)' }}>{new Date(v.created_at).toLocaleTimeString('es-CO')}</td>
                            <td style={{ fontSize: 12, padding: 8 }}>{v.folio} {v.estado === 'ANULADA' ? '(A)' : ''}</td>
                            <td style={{ fontSize: 12, padding: 8, textAlign: 'right', fontWeight: 600, color: v.estado === 'ANULADA' ? 'var(--text3)' : 'var(--vd)', textDecoration: v.estado === 'ANULADA' ? 'line-through' : 'none' }}>+ {fmt(v.total)}</td>
                            <td style={{ fontSize: 12, padding: 8, textAlign: 'center' }}>
                              {v.estado !== 'ANULADA' && (
                                <button className="btn btn-ghost btn-xs" style={{ padding: '4px 8px', color: 'var(--red)', fontSize: 11 }} onClick={() => anularVenta(v.id, v.folio)}>🚫 Anular</button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {ventasTurno.length === 0 && <tr><td colSpan="4" style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>No hay ventas en este turno</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {activeTab === 'historico' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Turno ID</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Inicial</th>
                  <th>Ingresos</th>
                  <th>Gastos</th>
                  <th>Saldo Final</th>
                  <th>Usuarios</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 700 }}>#{h.id}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(h.fecha_apertura).toLocaleString('es-CO')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{h.fecha_cierre ? new Date(h.fecha_cierre).toLocaleString('es-CO') : '—'}</td>
                    <td style={{ fontSize: 12 }}>{fmt(h.saldo_inicial)}</td>
                    <td style={{ fontSize: 12, color: 'var(--vd)', fontWeight: 600 }}>{fmt(h.ingresos)}</td>
                    <td style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>{fmt(h.gastos)}</td>
                    <td style={{ fontSize: 13, fontWeight: 700, color: 'var(--az)' }}>{fmt(h.saldo_final_calculado)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>
                      A: {h.usuario_apertura || '—'}<br/>
                      C: {h.usuario_cierre || '—'}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-xs" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => imprimirCuadre(h)}>🖨️ Imprimir</button>
                    </td>
                  </tr>
                ))}
                {historico.length === 0 && (
                  <tr><td colSpan="8" style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>No hay historial de cajas cerradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {renderModalAbrir()}
      {renderModalGasto()}
    </div>
  )
}
