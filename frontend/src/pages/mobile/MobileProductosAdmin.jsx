import { useState, useEffect } from 'react'
import { api, fmt } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'

const EMPTY = { nombre: '', descripcion: '', precio_venta: '', precio_costo: '', categoria_id: '', imagen_url: '', visible_formulario: 1, activo: 1 }

export default function MobileProductosAdmin() {
  const { toast, ToastContainer } = useToast()
  const [productos, setProductos]   = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState(EMPTY)
  const [editId, setEditId]         = useState(null)
  const [guardando, setGuardando]   = useState(false)
  
  // Mobile states
  const [showForm, setShowForm] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([api.getProductos(), api.getCategorias()])
      setProductos(p.data || [])
      setCategorias(c.data || [])
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  function abrirNuevo() { setForm(EMPTY); setEditId(null); setShowForm(true) }
  function abrirEditar(p) {
    setForm({ 
      nombre: p.nombre, descripcion: p.descripcion || '', 
      precio_venta: p.precio_venta, precio_costo: p.precio_costo, 
      categoria_id: p.categoria_id || '', imagen_url: p.imagen_url || '', 
      visible_formulario: p.visible_formulario, activo: p.activo 
    })
    setEditId(p.id)
    setShowForm(true)
  }

  async function guardar() {
    if (!form.nombre || !form.precio_venta) return toast('Nombre y precio de venta son requeridos', 'error')
    setGuardando(true)
    try {
      const payload = { ...form, precio_venta: parseFloat(form.precio_venta), precio_costo: parseFloat(form.precio_costo || 0), categoria_id: form.categoria_id || null }
      if (editId) await api.updateProducto(editId, payload)
      else        await api.createProducto(payload)
      toast(editId ? 'Producto actualizado' : 'Producto creado', 'success')
      setShowForm(false)
      cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }

  async function eliminar(id, nombre) {
    if (!window.confirm(`¿Eliminar "${nombre}"?`)) return
    try { await api.deleteProducto(id); toast('Producto eliminado', 'success'); cargar() }
    catch (e) { toast(e.message, 'error') }
  }

  const prodsFiltrados = productos.filter(p => {
    if (!busqueda) return true
    return p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  return (
    <>
      <ToastContainer />
      <MobileTopBar title="Menú" rightAction={
        <button className="mobile-icon-btn" onClick={abrirNuevo} style={{ background: '#eff6ff', color: '#3b82f6', borderRadius: '50%' }}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
        </button>
      }/>

      <div className="mobile-container">
        <input 
          className="input" 
          style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prodsFiltrados.map(p => {
              const cat = categorias.find(c => c.id == p.categoria_id)?.nombre || 'Sin categoría'
              return (
                <div key={p.id} style={{ 
                  background: 'white', padding: 12, borderRadius: 12, 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9',
                  display: 'flex', gap: 12, alignItems: 'center'
                }}>
                  <div style={{ width: 50, height: 50, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {p.imagen_url ? <img src={p.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: 20 }}>🍔</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{cat}</div>
                    <div style={{ color: '#3b82f6', fontWeight: 800, fontSize: 14, marginTop: 4 }}>{fmt(p.precio_venta)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button className="mobile-icon-btn" style={{ padding: 6, background: '#f1f5f9', borderRadius: 8 }} onClick={() => abrirEditar(p)}>
                      ✏️
                    </button>
                    <button className="mobile-icon-btn" style={{ padding: 6, background: '#fef2f2', borderRadius: 8 }} onClick={() => eliminar(p.id, p.nombre)}>
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
            
            {prodsFiltrados.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No se encontraron productos</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sheet Form */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }}>
          
          <div style={{ 
            background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '20px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{editId ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setShowForm(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Nombre</label>
                <input className="input" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>P. Venta</label>
                  <input className="input" type="number" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={form.precio_venta} onChange={e => setForm({...form, precio_venta: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>P. Costo</label>
                  <input className="input" type="number" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={form.precio_costo} onChange={e => setForm({...form, precio_costo: e.target.value})} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Categoría</label>
                <select className="input" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={form.categoria_id} onChange={e => setForm({...form, categoria_id: e.target.value})}>
                  <option value="">Seleccione...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>URL Imagen (Opcional)</label>
                <input className="input" style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0' }} value={form.imagen_url} onChange={e => setForm({...form, imagen_url: e.target.value})} />
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.activo == 1} onChange={e => setForm({...form, activo: e.target.checked ? 1 : 0})} />
                  Activo
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.visible_formulario == 1} onChange={e => setForm({...form, visible_formulario: e.target.checked ? 1 : 0})} />
                  Visible en Menú
                </label>
              </div>

              <button 
                className="btn" 
                style={{ width: '100%', padding: 16, borderRadius: 12, background: '#3b82f6', color: 'white', fontWeight: 700, fontSize: 16, marginTop: 16 }}
                onClick={guardar}
                disabled={guardando}
              >
                {guardando ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
