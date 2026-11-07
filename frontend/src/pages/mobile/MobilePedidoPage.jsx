import { useState, useEffect, useMemo } from 'react'
import { api, fmt } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'

export default function MobilePedidoPage() {
  const { toast, ToastContainer } = useToast()

  const [config, setConfig]         = useState({})
  const [categorias, setCategorias] = useState([])
  const [mesas, setMesas]           = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos]   = useState([])
  const [loading, setLoading]       = useState(true)

  const [cliente, setCliente]       = useState('')
  const [vendedorId, setVendedorId] = useState('')
  const [tipo, setTipo]             = useState('mesa')
  const [mesaId, setMesaId]         = useState('')
  const [telefono, setTelefono]     = useState('')
  const [direccion, setDireccion]   = useState('')
  const [obs, setObs]               = useState('')
  const [catActiva, setCatActiva]   = useState('todos')
  const [busqueda, setBusqueda]     = useState('')
  const [carrito, setCarrito]       = useState([])
  const [enviando, setEnviando]     = useState(false)
  
  // Mobile specific state
  const [showCart, setShowCart]     = useState(false)

  useEffect(() => {
    Promise.all([
      api.getConfig(),
      api.getCategorias(),
      api.getMesas(),
      api.getVendedores(),
      api.getProductos({ activo: 1, visible_formulario: 1 }),
    ]).then(([cfg, cats, mes, vends, prods]) => {
      setConfig(cfg.data || {})
      setCategorias(cats.data || [])
      setMesas((mes.data || []).filter(m => m.activa))
      setVendedores((vends.data || []).filter(v => v.activo))
      setProductos(prods.data || [])
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const productosFiltrados = useMemo(() => {
    let lista = productos
    if (catActiva !== 'todos') lista = lista.filter(p => p.categoria_id == catActiva)
    if (busqueda.trim()) lista = lista.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    return lista
  }, [productos, catActiva, busqueda])

  const total = carrito.reduce((s, it) => s + it.precio_venta * it.cantidad, 0)
  const totalItems = carrito.reduce((s, it) => s + it.cantidad, 0)

  function agregar(prod) {
    setCarrito(prev => {
      const ex = prev.find(x => x.id === prod.id)
      if (ex) return prev.map(x => x.id === prod.id ? { ...x, cantidad: x.cantidad + 1 } : x)
      return [...prev, { ...prod, cantidad: 1 }]
    })
    toast(`✓ ${prod.nombre} agregado`)
  }

  function cambiarQty(id, delta) {
    setCarrito(prev => {
      const updated = prev.map(x => x.id === id ? { ...x, cantidad: x.cantidad + delta } : x)
      return updated.filter(x => x.cantidad > 0)
    })
  }

  function quitar(id) { setCarrito(prev => prev.filter(x => x.id !== id)) }

  async function enviarPedido() {
    if (!cliente.trim()) return toast('Ingresa el nombre del cliente', 'error')
    if (!carrito.length) return toast('Agrega al menos un producto', 'error')
    if (tipo === 'mesa' && !mesaId) return toast('Selecciona una mesa', 'error')
    
    setEnviando(true)
    try {
      const res = await api.createPedido({
        nombre_cliente: cliente.trim(),
        tipo_pedido: tipo,
        mesa_id: tipo === 'mesa' ? Number(mesaId) : null,
        vendedor_id: vendedorId ? Number(vendedorId) : null,
        telefono: tipo === 'domicilio' ? telefono : null,
        direccion: tipo === 'domicilio' ? direccion : null,
        observaciones: obs || null,
        items: carrito.map(it => ({
          producto_id: it.id,
          cantidad: it.cantidad,
          precio_unitario: it.precio_venta,
        })),
      })
      toast(`Pedido enviado con éxito (#${res.data.numero_pedido})`, 'success', 4000)
      setCarrito([])
      setCliente('')
      setMesaId('')
      setVendedorId('')
      setTelefono('')
      setDireccion('')
      setObs('')
      setShowCart(false)
    } catch (err) {
      toast(err.message || 'Error al enviar pedido', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mobile-layout" style={{ background: '#f8fafc' }}>
      <ToastContainer />
      <MobileTopBar title="Tomar Pedido" rightAction={
        <a href="/login" style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>Login</a>
      }/>
      
      <main className="mobile-content" style={{ paddingBottom: 100 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }}/></div>
        ) : (
          <div className="mobile-container">
            {/* Buscador */}
            <input 
              className="input" 
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}
              placeholder="Buscar productos..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />

            {/* Categorías (Scroll Horizontal) */}
            <div style={{ display: 'flex', overflowX: 'auto', gap: 8, paddingBottom: 16, margin: '0 -16px', paddingLeft: 16, paddingRight: 16 }}>
              <button 
                className={`btn ${catActiva === 'todos' ? 'btn-primary' : 'btn-outline'}`}
                style={{ borderRadius: 20, padding: '8px 16px', whiteSpace: 'nowrap' }}
                onClick={() => setCatActiva('todos')}
              >Todos</button>
              {categorias.map(c => (
                <button 
                  key={c.id}
                  className={`btn ${catActiva == c.id ? 'btn-primary' : 'btn-outline'}`}
                  style={{ borderRadius: 20, padding: '8px 16px', whiteSpace: 'nowrap' }}
                  onClick={() => setCatActiva(c.id)}
                >
                  {c.nombre}
                </button>
              ))}
            </div>

            {/* Grid de Productos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingBottom: 40 }}>
              {productosFiltrados.map(p => {
                const enCarrito = carrito.find(x => x.id === p.id)
                return (
                  <div key={p.id} style={{ background: 'white', borderRadius: 16, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 100, background: '#f1f5f9', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.imagen_url ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍔'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4, lineHeight: 1.2 }}>{p.nombre}</div>
                    <div style={{ fontSize: 13, color: '#3b82f6', fontWeight: 800, marginBottom: 12, marginTop: 'auto' }}>{fmt(p.precio_venta)}</div>
                    
                    {enCarrito ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', borderRadius: 8, padding: 4 }}>
                        <button className="mobile-icon-btn" style={{ padding: 4, background: 'white', borderRadius: 4 }} onClick={() => cambiarQty(p.id, -1)}>-</button>
                        <strong style={{ fontSize: 14 }}>{enCarrito.cantidad}</strong>
                        <button className="mobile-icon-btn" style={{ padding: 4, background: 'white', borderRadius: 4 }} onClick={() => cambiarQty(p.id, 1)}>+</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary" style={{ padding: '8px', fontSize: 13, width: '100%' }} onClick={() => agregar(p)}>
                        Agregar
                      </button>
                    )}
                  </div>
                )
              })}
              {productosFiltrados.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#94a3b8' }}>No hay productos</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Cart FAB (Floating Bottom Area) */}
      {carrito.length > 0 && !showCart && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 90 }}>
          <button 
            style={{ 
              width: '100%', background: '#0f172a', color: 'white', border: 'none', 
              padding: 16, borderRadius: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 4px 12px rgba(15,23,42,0.2)'
            }}
            onClick={() => setShowCart(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20, fontSize: 14, fontWeight: 700 }}>{totalItems}</div>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Ver Carrito</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* Bottom Sheet - Carrito y Checkout */}
      {showCart && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setShowCart(false)}>
          
          <div style={{ 
            background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Tu Pedido</h2>
              <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setShowCart(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
              {carrito.map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>{it.cantidad}x</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{it.nombre}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{fmt(it.precio_venta)} c/u</div>
                    </div>
                  </div>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>{fmt(it.precio_venta * it.cantidad)}</strong>
                </div>
              ))}
              
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '16px 0' }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Nombre del Cliente</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} placeholder="Ej. Juan Pérez" value={cliente} onChange={e => setCliente(e.target.value)} />
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Tipo</label>
                    <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={tipo} onChange={e => setTipo(e.target.value)}>
                      <option value="mesa">Mesa</option>
                      <option value="domicilio">Domicilio</option>
                      <option value="venta_interna">Interna</option>
                    </select>
                  </div>
                  {tipo === 'mesa' && (
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Mesa</label>
                      <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={mesaId} onChange={e => setMesaId(e.target.value)}>
                        <option value="">Sel...</option>
                        {mesas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Mesero (Opcional)</label>
                  <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
                    <option value="">Seleccionar mesero...</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                </div>
                
                {tipo === 'domicilio' && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Teléfono</label>
                      <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Dirección</label>
                      <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={direccion} onChange={e => setDireccion(e.target.value)} />
                    </div>
                  </>
                )}

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Observaciones</label>
                  <textarea className="input" style={{ width: '100%', padding: 12, borderRadius: 12, minHeight: 60 }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Sin cebolla, etc."/>
                </div>
              </div>
            </div>

            <div style={{ padding: 24, borderTop: '1px solid #e2e8f0', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#64748b' }}>Total a pagar</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{fmt(total)}</span>
              </div>
              <button 
                className="btn" 
                style={{ width: '100%', padding: 16, borderRadius: 16, background: '#3b82f6', color: 'white', fontWeight: 700, fontSize: 16 }}
                onClick={enviarPedido}
                disabled={enviando || carrito.length === 0}
              >
                {enviando ? 'Enviando...' : 'Confirmar Pedido'}
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  )
}
