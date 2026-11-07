import { useState, useEffect } from 'react'
import { api, fmt } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'

const UNIDADES = ['kg', 'g', 'lt', 'ml', 'und', 'taza']

function calcular(ings, porciones, precio) {
  const costo = ings.reduce((s, i) => s + (parseFloat(i.cantidad) || 0) * (parseFloat(i.costo_unitario) || 0), 0)
  const pp    = costo / (parseInt(porciones) || 1)
  const mg    = pp > 0 ? ((precio - pp) / pp * 100) : 0
  return { costo_total: costo, costo_por_porcion: pp, margen_bruto: mg, utilidad_porcion: precio - pp }
}

export default function MobileCosteoAdmin() {
  const { toast, ToastContainer } = useToast()
  
  const [activeView, setActiveView] = useState('list') // 'list' or 'form'
  const [historial, setHistorial] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  // Form State
  const [nombre, setNombre]       = useState('')
  const [porciones, setPorciones] = useState(1)
  const [precio, setPrecio]       = useState(0)
  const [ings, setIngs]           = useState([{ id: Date.now(), nombre: '', cantidad: 1, unidad: 'kg', costo_unitario: 0 }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getCosteos(),
      api.getProductos({ activo: 1 })
    ]).then(([resHist, resProd]) => {
      setHistorial(resHist.data || [])
      setProductos(resProd.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const calc = calcular(ings, porciones, precio)

  function addIng() { setIngs(prev => [...prev, { id: Date.now(), nombre: '', cantidad: 1, unidad: 'kg', costo_unitario: 0 }]) }
  function updIng(id, field, val) { setIngs(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i)) }
  function delIng(id) { setIngs(prev => prev.filter(i => i.id !== id)) }

  function prellenar(val) {
    if (!val) return
    setNombre(val)
    const prod = productos.find(p => p.nombre === val)
    if (prod) setPrecio(prod.precio_venta)
  }

  function nueva() {
    setNombre(''); setPorciones(1); setPrecio(0)
    setIngs([{ id: Date.now(), nombre: '', cantidad: 1, unidad: 'kg', costo_unitario: 0 }])
    setActiveView('form')
  }

  async function guardar() {
    if (!nombre.trim()) return toast('Ingresa el nombre de la receta', 'error')
    if (!ings.length) return toast('Agrega al menos un ingrediente', 'error')
    setGuardando(true)
    try {
      const prod = productos.find(p => p.nombre === nombre)
      await api.saveCosteo({
        nombre_receta: nombre,
        producto_id: prod?.id || null,
        porciones: parseInt(porciones) || 1,
        precio_venta_ref: parseFloat(precio) || 0,
        costo_total: calc.costo_total,
        costo_por_porcion: calc.costo_por_porcion,
        margen_bruto: parseFloat(calc.margen_bruto.toFixed(2)),
        utilidad_porcion: calc.utilidad_porcion,
        ingredientes: ings.map(i => ({
          nombre: i.nombre,
          cantidad: parseFloat(i.cantidad) || 0,
          unidad: i.unidad,
          costo_unitario: parseFloat(i.costo_unitario) || 0,
          subtotal: (parseFloat(i.cantidad) || 0) * (parseFloat(i.costo_unitario) || 0),
        }))
      })
      const r = await api.getCosteos()
      setHistorial(r.data || [])
      toast('Receta guardada en historial', 'success')
      setActiveView('list')
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }

  async function cargarReceta(id) {
    try {
      const r = await api.getCosteo(id)
      const c = r.data
      setNombre(c.nombre_receta)
      setPorciones(c.porciones)
      setPrecio(c.precio_venta_ref)
      setIngs((c.ingredientes || []).map(i => ({ ...i, id: Date.now() + Math.random() })))
      setActiveView('form')
    } catch (e) { toast(e.message, 'error') }
  }

  async function eliminarReceta(id) {
    if (!window.confirm('¿Eliminar esta receta del historial?')) return
    try {
      await api.deleteCosteo(id)
      setHistorial(prev => prev.filter(c => c.id !== id))
      toast('Eliminada del historial')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <ToastContainer />
      <MobileTopBar title="Costeos" rightAction={
        activeView === 'list' && (
          <button className="mobile-icon-btn" onClick={nueva}>
             <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
          </button>
        )
      } />

      <div className="mobile-container" style={{ paddingBottom: activeView === 'form' ? 140 : 20 }}>
        
        {/* VISTA: LISTA DE HISTORIAL */}
        {activeView === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}/></div>
            ) : historial.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div>No hay costeos guardados.</div>
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={nueva}>+ Crear mi primera receta</button>
              </div>
            ) : (
              historial.map(c => (
                <div key={c.id} style={{ 
                  background: 'white', padding: 16, borderRadius: 12, 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{c.nombre_receta}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{c.fecha_calculo}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: c.margen_bruto > 30 ? '#10b981' : '#ef4444' }}>
                      {parseFloat(c.margen_bruto || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#475569', marginBottom: 12 }}>
                    <div>Costo: <strong>{fmt(Math.round(c.costo_por_porcion))}</strong> / porc</div>
                    <div>Venta: <strong>{fmt(c.precio_venta_ref)}</strong></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" style={{ flex: 1, padding: '8px', background: '#eff6ff', color: '#3b82f6', borderRadius: 8, fontSize: 13 }} onClick={() => cargarReceta(c.id)}>Ver / Editar</button>
                    <button className="mobile-icon-btn" style={{ background: '#fef2f2', color: '#ef4444', borderRadius: 8, padding: '8px' }} onClick={() => eliminarReceta(c.id)}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* VISTA: FORMULARIO COSTEO */}
        {activeView === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', color: '#64748b', padding: '4px 0' }} onClick={() => setActiveView('list')}>
              ← Volver al listado
            </button>

            <div style={{ background: 'white', padding: 16, borderRadius: 12, border: '1px solid #f1f5f9' }}>
              <label className="label">Producto o Nombre de Receta</label>
              <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12, marginBottom: (nombre === '__custom' || (!productos.find(p => p.nombre === nombre) && nombre)) ? 8 : 0 }} value={nombre} onChange={e => prellenar(e.target.value)}>
                <option value="">— Seleccionar del catálogo —</option>
                {productos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                <option value="__custom">✏️ Escribir otro nombre</option>
              </select>
              {(nombre === '__custom' || (!productos.find(p => p.nombre === nombre) && nombre && nombre !== '__custom')) && (
                <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} placeholder="Ej: Salsa Especial" value={nombre === '__custom' ? '' : nombre} onChange={e => setNombre(e.target.value)} />
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Porciones</label>
                  <input className="input" type="number" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={porciones} min={1} onChange={e => setPorciones(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">Precio (ref)</label>
                  <input className="input" type="number" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={precio} onChange={e => setPrecio(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            <div style={{ background: 'white', padding: 16, borderRadius: 12, border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Ingredientes</div>
                <button className="btn btn-ghost btn-xs" style={{ color: '#3b82f6', background: '#eff6ff' }} onClick={addIng}>+ Añadir</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ings.map((i, idx) => (
                  <div key={i.id} style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input className="input" style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 13 }} placeholder="Nombre ingrediente" value={i.nombre} onChange={e => updIng(i.id, 'nombre', e.target.value)} />
                      <button className="mobile-icon-btn" style={{ padding: '0 8px', background: '#fef2f2', color: '#ef4444', borderRadius: 8 }} onClick={() => delIng(i.id)}>X</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="input" type="number" style={{ width: '30%', padding: 8, borderRadius: 8, fontSize: 13 }} placeholder="Cant" value={i.cantidad} onChange={e => updIng(i.id, 'cantidad', e.target.value)} />
                      <select className="input" style={{ width: '35%', padding: 8, borderRadius: 8, fontSize: 13 }} value={i.unidad} onChange={e => updIng(i.id, 'unidad', e.target.value)}>
                        {UNIDADES.map(u => <option key={u}>{u}</option>)}
                      </select>
                      <input className="input" type="number" style={{ width: '35%', padding: 8, borderRadius: 8, fontSize: 13, textAlign: 'right' }} placeholder="$/u" value={i.costo_unitario} onChange={e => updIng(i.id, 'costo_unitario', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STICKY FOOTER PARA RESULTADOS */}
            <div style={{ 
              position: 'fixed', bottom: 0, left: 0, right: 0, 
              background: 'white', padding: '16px 20px', 
              boxShadow: '0 -4px 12px rgba(0,0,0,0.05)', borderTop: '1px solid #e2e8f0',
              zIndex: 100, display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                <div style={{ textAlign: 'center' }}>
                  <div>Costo/Porc</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmt(Math.round(calc.costo_por_porcion))}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div>Margen</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: calc.margen_bruto > 30 ? '#10b981' : '#ef4444' }}>{calc.margen_bruto.toFixed(1)}%</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div>Utilidad/Porc</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmt(Math.round(calc.utilidad_porcion))}</div>
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12, fontSize: 16, fontWeight: 700 }} onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando...' : `Guardar Receta (${fmt(Math.round(calc.costo_total))})`}
              </button>
            </div>

          </div>
        )}
      </div>
    </>
  )
}
