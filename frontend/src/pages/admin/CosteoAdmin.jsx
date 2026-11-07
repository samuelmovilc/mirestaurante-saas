import { useState, useEffect } from 'react'
import { api, fmt } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

const UNIDADES = ['kg', 'g', 'lt', 'ml', 'und', 'taza']

function calcular(ings, porciones, precio) {
  const costo = ings.reduce((s, i) => s + (parseFloat(i.cantidad) || 0) * (parseFloat(i.costo_unitario) || 0), 0)
  const pp    = costo / (parseInt(porciones) || 1)
  const mg    = pp > 0 ? ((precio - pp) / pp * 100) : 0
  return { costo_total: costo, costo_por_porcion: pp, margen_bruto: mg, utilidad_porcion: precio - pp }
}

export default function CosteoAdmin() {
  const { toast, ToastContainer } = useToast()
  const [historial, setHistorial] = useState([])
  const [productos, setProductos] = useState([])
  const [nombre, setNombre]       = useState('')
  const [porciones, setPorciones] = useState(1)
  const [precio, setPrecio]       = useState(0)
  const [ings, setIngs]           = useState([{ id: Date.now(), nombre: '', cantidad: 1, unidad: 'kg', costo_unitario: 0 }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api.getCosteos().then(r => setHistorial(r.data || [])).catch(() => {})
    api.getProductos({ activo: 1 }).then(r => setProductos(r.data || [])).catch(() => {})
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
      toast('Receta guardada en historial')
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
      toast('Receta cargada')
    } catch (e) { toast(e.message, 'error') }
  }

  async function eliminarReceta(id) {
    if (!confirm('¿Eliminar esta receta del historial?')) return
    try {
      await api.deleteCosteo(id)
      setHistorial(prev => prev.filter(c => c.id !== id))
      toast('Eliminada del historial')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div>
      <ToastContainer />
      <div className="page-header">
        <div><h2>Costeo de recetas</h2><p>Calculadora de costo. No modifica precios del catálogo.</p></div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={nueva}>Nueva receta</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar receta'}</button>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="card">
            <div className="card-header"><h3>Receta actual</h3></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="label">Producto / Nombre receta</label>
                  <select className="select" value={nombre} onChange={e => prellenar(e.target.value)}>
                    <option value="">— Seleccionar producto —</option>
                    {productos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                    <option value="__custom">✏️ Nombre personalizado</option>
                  </select>
                  {(nombre === '__custom' || !productos.find(p => p.nombre === nombre)) && nombre && nombre !== '__custom' && null}
                  {nombre === '__custom' && (
                    <input className="input" style={{ marginTop: 8 }} placeholder="Nombre de la receta" onChange={e => setNombre(e.target.value)} />
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Porciones</label>
                  <input className="input" type="number" value={porciones} min={1} onChange={e => setPorciones(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Precio venta (referencia)</label>
                  <input className="input" type="number" value={precio} onChange={e => setPrecio(parseFloat(e.target.value) || 0)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Ingredientes</span>
                <button className="btn btn-ghost btn-xs" onClick={addIng}>+ Ingrediente</button>
              </div>

              {ings.map(i => (
                <div key={i.id} className="cos-ing-row">
                  <input className="input" style={{ fontSize: 12 }} placeholder="Ingrediente" value={i.nombre} onChange={e => updIng(i.id, 'nombre', e.target.value)} />
                  <input className="input" type="number" style={{ fontSize: 12 }} value={i.cantidad} onChange={e => updIng(i.id, 'cantidad', e.target.value)} />
                  <select className="select" style={{ fontSize: 12 }} value={i.unidad} onChange={e => updIng(i.id, 'unidad', e.target.value)}>
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                  <input className="input" type="number" style={{ fontSize: 12, textAlign: 'right' }} placeholder="$/u" value={i.costo_unitario} onChange={e => updIng(i.id, 'costo_unitario', e.target.value)} />
                  <button className="btn btn-danger btn-xs" style={{ padding: '4px 7px' }} onClick={() => delIng(i.id)}>×</button>
                </div>
              ))}

              <div className="cos-result">
                <span>Costo estimado de receta</span>
                <strong>{fmt(Math.round(calc.costo_total))}</strong>
              </div>
              <div className="cos-metrics">
                <div className="cos-m"><div className="cos-m-label">Costo / porción</div><div className="cos-m-value">{fmt(Math.round(calc.costo_por_porcion))}</div></div>
                <div className="cos-m"><div className="cos-m-label">Margen bruto</div><div className="cos-m-value" style={{ color: calc.margen_bruto > 30 ? 'var(--vd)' : 'var(--rd)' }}>{calc.margen_bruto.toFixed(1)}%</div></div>
                <div className="cos-m"><div className="cos-m-label">Utilidad / porción</div><div className="cos-m-value">{fmt(Math.round(calc.utilidad_porcion))}</div></div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h3>Historial de costeos</h3>
              <span className="badge badge-gray">{historial.length}</span>
            </div>
            <div className="card-body" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {historial.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>Sin recetas guardadas</div>
              ) : historial.map(c => (
                <div key={c.id} className="hist-item">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{c.nombre_receta}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {c.fecha_calculo} · Costo: {fmt(Math.round(c.costo_por_porcion))}/porc · Precio: {fmt(c.precio_venta_ref)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: c.margen_bruto > 30 ? 'var(--vd)' : 'var(--rd)' }}>{parseFloat(c.margen_bruto || 0).toFixed(1)}%</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => cargarReceta(c.id)}>Cargar</button>
                    <button className="btn btn-danger btn-xs" onClick={() => eliminarReceta(c.id)}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
