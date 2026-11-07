import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { api, fmt, today } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'

export default function MobileCajaAdmin() {
  const { toast, ToastContainer } = useToast()
  const [ventas, setVentas]   = useState([])
  const [stats, setStats]     = useState({})
  const [loading, setLoading] = useState(true)
  const [fi, setFi] = useState(today())
  const [ff, setFf] = useState(today())
  const [est, setEst] = useState('')
  
  // Mobile UI States
  const [showFilters, setShowFilters] = useState(false)

  async function cargar() {
    setLoading(true)
    try {
      const params = { fecha_inicio: fi, fecha_fin: ff }
      if (est) params.estado = est
      const [v] = await Promise.all([api.getVentas(params)])
      const ventasData = v.data || []
      setVentas(ventasData)
      
      const aceptadas = ventasData.filter(x => x.estado === 'ACEPTADA')
      const totalVendido = aceptadas.reduce((sum, x) => sum + parseFloat(x.total || 0), 0)
      const totalCosto = aceptadas.reduce((sum, x) => sum + parseFloat(x.total_costo || 0), 0)
      const utilidadBruta = totalVendido - totalCosto
      const porcentaje = totalCosto > 0 ? ((utilidadBruta / totalCosto) * 100).toFixed(2) : (utilidadBruta > 0 ? 100 : 0)
      
      setStats({
        total_ventas: aceptadas.length,
        total_vendido: totalVendido,
        utilidad_bruta: utilidadBruta,
        porcentaje_utilidad: porcentaje
      })
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  async function anular(id, folio) {
    if (!window.confirm(`¿Anular la venta ${folio}?`)) return
    try {
      await api.anularVenta(id)
      toast('Venta anulada')
      cargar()
    } catch (e) { toast(e.message, 'error') }
  }

  function exportar() {
    try {
      const aceptadas = ventas.filter(x => x.estado === 'ACEPTADA')
      const totalesPorMetodo = {}
      let totalGeneral = 0
      
      aceptadas.forEach(v => {
        let parsed = []
        try { parsed = JSON.parse(v.metodos_pago) } catch(e){}
        parsed.forEach(m => {
          const tipo = m.tipo || 'Efectivo'
          const amt = parseFloat(m.monto || 0)
          if (!totalesPorMetodo[tipo]) totalesPorMetodo[tipo] = 0
          totalesPorMetodo[tipo] += amt
          totalGeneral += amt
        })
      })

      const resumenCierre = [
        ['CIERRE DE CAJA', `Del ${fi} al ${ff}`],
        [],
        ['MÉTODO DE PAGO', 'TOTAL RECAUDADO']
      ]
      
      Object.keys(totalesPorMetodo).forEach(tipo => {
        resumenCierre.push([tipo, totalesPorMetodo[tipo]])
      })
      resumenCierre.push([])
      resumenCierre.push(['TOTAL GENERAL', totalGeneral])
      resumenCierre.push([])
      resumenCierre.push(['UTILIDAD BRUTA', stats.utilidad_bruta])
      resumenCierre.push(['MARGEN %', stats.porcentaje_utilidad + '%'])

      const movimientos = ventas.map(v => {
        let pagos = ''
        try {
          const p = JSON.parse(v.metodos_pago)
          pagos = p.map(x => `${x.tipo}: $${x.monto}`).join(' | ')
        } catch(e){}
        return {
          'Folio': v.id_venta,
          'Fecha': new Date(v.created_at).toLocaleDateString('es-CO'),
          'Hora': new Date(v.created_at).toLocaleTimeString('es-CO'),
          'Cliente': v.cliente_nombre,
          'Ítems': v.items_count || 0,
          'Total Venta': parseFloat(v.total || 0),
          'Costo (Sistema)': parseFloat(v.total_costo || 0),
          'Utilidad': parseFloat(v.total || 0) - parseFloat(v.total_costo || 0),
          'Métodos de Pago': pagos,
          'Estado': v.estado
        }
      })

      const wb = XLSX.utils.book_new()
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenCierre)
      const wsMovimientos = XLSX.utils.json_to_sheet(movimientos)

      XLSX.utils.book_append_sheet(wb, wsResumen, 'Cierre por Método de Pago')
      XLSX.writeFile(wb, `Caja_${fi}_al_${ff}.xlsx`)
      toast('Exportado a Excel correctamente', 'success')
    } catch(e) {
      toast('Error al exportar: ' + e.message, 'error')
    }
  }

  function exportarPDF() {
    try {
      const doc = new jsPDF({ unit: 'mm', format: [80, 200] })
      let y = 10
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('CIERRE DE CAJA', 40, y, { align: 'center' })
      y += 6
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Del: ${fi}`, 40, y, { align: 'center' }); y += 5
      doc.text(`Al: ${ff}`, 40, y, { align: 'center' }); y += 10
      
      const aceptadas = ventas.filter(x => x.estado === 'ACEPTADA')
      const totalesPorMetodo = {}
      let totalGeneral = 0
      aceptadas.forEach(v => {
        let parsed = []
        try { parsed = JSON.parse(v.metodos_pago) } catch(e){}
        parsed.forEach(m => {
          const tipo = m.tipo || 'Efectivo'
          const amt = parseFloat(m.monto || 0)
          if (!totalesPorMetodo[tipo]) totalesPorMetodo[tipo] = 0
          totalesPorMetodo[tipo] += amt
          totalGeneral += amt
        })
      })

      doc.setFont('helvetica', 'bold')
      doc.text('MÉTODOS DE PAGO', 40, y, { align: 'center' })
      y += 6
      doc.setFont('helvetica', 'normal')
      Object.keys(totalesPorMetodo).forEach(tipo => {
        doc.text(`${tipo}:`, 10, y)
        doc.text(fmt(totalesPorMetodo[tipo]), 70, y, { align: 'right' })
        y += 5
      })
      y += 5
      doc.line(10, y, 70, y)
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.text('TOTAL RECAUDADO:', 10, y)
      doc.text(fmt(totalGeneral), 70, y, { align: 'right' })
      y += 8
      doc.text('UTILIDAD BRUTA:', 10, y)
      doc.text(fmt(stats.utilidad_bruta), 70, y, { align: 'right' })
      y += 8
      doc.text('MARGEN:', 10, y)
      doc.text(stats.porcentaje_utilidad + '%', 70, y, { align: 'right' })
      y += 10
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`Ventas procesadas: ${aceptadas.length}`, 40, y, { align: 'center' })
      doc.save(`CierreCaja_${fi}_al_${ff}.pdf`)
      toast('PDF generado (80mm)', 'success')
    } catch (e) {
      toast('Error al exportar PDF', 'error')
    }
  }

  return (
    <>
      <ToastContainer />
      <MobileTopBar title="Caja" rightAction={
        <button className="mobile-icon-btn" onClick={() => setShowFilters(true)}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
        </button>
      } />

      <div className="mobile-container">
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#eff6ff', padding: 16, borderRadius: 12, border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, textTransform: 'uppercase' }}>Vendido</div>
            <div style={{ fontSize: 20, color: '#1e3a8a', fontWeight: 800, margin: '4px 0' }}>{fmt(stats.total_vendido)}</div>
            <div style={{ fontSize: 11, color: '#3b82f6' }}>{stats.total_ventas} ventas</div>
          </div>
          <div style={{ background: '#ecfdf5', padding: 16, borderRadius: 12, border: '1px solid #a7f3d0' }}>
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Utilidad</div>
            <div style={{ fontSize: 20, color: '#064e3b', fontWeight: 800, margin: '4px 0' }}>{fmt(stats.utilidad_bruta)}</div>
            <div style={{ fontSize: 11, color: '#10b981' }}>{stats.porcentaje_utilidad || 0}% margen</div>
          </div>
        </div>

        {/* Listado */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ventas.map(v => (
              <div key={v.id} style={{ 
                background: 'white', padding: 16, borderRadius: 12, 
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9',
                display: 'flex', flexDirection: 'column', gap: 8,
                opacity: v.estado === 'ANULADA' ? 0.6 : 1
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 14, color: '#0f172a' }}>{v.folio}</strong>
                    <span className={`badge ${v.estado === 'ACEPTADA' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                      {v.estado}
                    </span>
                  </div>
                  <strong style={{ fontSize: 15, color: v.estado === 'ANULADA' ? '#94a3b8' : '#3b82f6' }}>{fmt(v.total)}</strong>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                  <span>{v.cliente_nombre || 'Cliente general'}</span>
                  <span>{v.hora_venta}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {v.items_count || 0} items • Util: <span style={{ color: '#059669', fontWeight: 600 }}>{fmt(v.total - v.total_costo)}</span>
                  </div>
                  {v.estado === 'ACEPTADA' && (
                    <button className="btn btn-ghost btn-xs" style={{ color: '#ef4444', padding: '4px 8px' }} onClick={() => anular(v.id, v.folio)}>
                      Anular
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {ventas.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No hay ventas en esta fecha</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sheet - Filtros y Exportar */}
      {showFilters && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setShowFilters(false)}>
          
          <div style={{ 
            background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Filtros y Reportes</h3>
              <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setShowFilters(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Desde</label>
                <input className="input" type="date" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={fi} onChange={e => setFi(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Hasta</label>
                <input className="input" type="date" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={ff} onChange={e => setFf(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Estado</label>
              <select className="input" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={est} onChange={e => setEst(e.target.value)}>
                <option value="">Todas</option>
                <option value="ACEPTADA">Aceptada</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </div>

            <button className="btn btn-primary" style={{ padding: 14, borderRadius: 12, fontWeight: 700 }} onClick={() => { cargar(); setShowFilters(false); }}>
              Aplicar Filtros
            </button>
            
            <div style={{ borderTop: '1px solid #f1f5f9', margin: '8px 0' }} />
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1, padding: 14, borderRadius: 12, background: '#10b981', color: 'white', fontWeight: 600, fontSize: 14 }} onClick={() => { exportar(); setShowFilters(false); }}>
                📥 Excel
              </button>
              <button className="btn" style={{ flex: 1, padding: 14, borderRadius: 12, background: '#ef4444', color: 'white', fontWeight: 600, fontSize: 14 }} onClick={() => { exportarPDF(); setShowFilters(false); }}>
                📄 PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
