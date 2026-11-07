import { useState, useEffect, useMemo } from 'react'
import { api, fmt } from '../lib/api'
import { useToast } from '../hooks/useToast'

export default function PedidoPage() {
  const { toast, ToastContainer } = useToast()

  const [config, setConfig]         = useState({})
  const [categorias, setCategorias] = useState([])
  const [mesas, setMesas]           = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos]   = useState([])
  const [loading, setLoading]       = useState(true)

  const DEFAULT_CLIENTE = 'Cliente pos - 2222'
  const [cliente, setCliente]       = useState(DEFAULT_CLIENTE)
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
      const activas = (mes.data || []).filter(m => m.activa)
      setMesas(activas)
      if (activas.length > 0) {
        setMesaId(activas[0].id)
      }
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

  function agregar(prod) {
    setCarrito(prev => {
      const ex = prev.find(x => x.id === prod.id)
      if (ex) return prev.map(x => x.id === prod.id ? { ...x, cantidad: x.cantidad + 1 } : x)
      return [...prev, { ...prod, cantidad: 1 }]
    })
    toast(`✓ ${prod.nombre}`)
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
      toast(`Pedido #${res.data.numero_pedido} enviado — Total: ${fmt(res.data.total)}`, 'success', 4000)
      setCarrito([])
      setCliente(DEFAULT_CLIENTE)
      setMesaId(mesas.length > 0 ? mesas[0].id : '')
      setVendedorId('')
      setTelefono('')
      setDireccion('')
      setObs('')
    } catch (err) {
      toast(err.message || 'Error al enviar pedido', 'error')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return <div className="loading-page"><div className="spinner" /></div>

  return (
    <div className="pedido-page">
      <ToastContainer />

      {/* HEADER */}
      <header className="pedido-header">
        <div className="pedido-logo">
          <div className="pedido-logo-img">
            {config.logo_url ? <img src={config.logo_url} alt="logo" /> : '🍗'}
          </div>
          <div>
            <h1>{config.nombre_negocio || 'Amarillo Pollo'}</h1>
            <p style={{ fontSize: 10, color: 'var(--text3)' }}>{config.slogan || 'Toma de pedidos'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
          <div className="online-dot" />
          ONLINE
        </div>
      </header>

      <div className="pedido-main">
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Tomar pedido</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>Registra los datos y selecciona los productos.</p>

        {/* DATOS */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>Datos del pedido</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label className="label">Nombre del cliente</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="Ej. Carlos Pérez" value={cliente} onChange={e => setCliente(e.target.value)} />
                <button 
                  className="btn btn-ghost btn-icon" 
                  title="Limpiar"
                  onClick={() => setCliente('')}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="label">Mesero / Vendedor</label>
              <select className="select" value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
                <option value="">Seleccionar responsable (Opcional)</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre} ({v.rol})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Tipo de pedido</label>
              <div className="tipo-group">
                {[
                  { key: 'mesa', icon: '🪑', label: 'Mesa' },
                  { key: 'domicilio', icon: '🛵', label: 'Domicilio' },
                  { key: 'venta_interna', icon: '🏠', label: 'Interna' },
                ].map(t => (
                  <button key={t.key} className={`tipo-btn ${tipo === t.key ? 'active' : ''}`} onClick={() => setTipo(t.key)}>
                    <span className="tipo-icon">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tipo === 'mesa' && (
              <div className="form-group">
                <label className="label">Mesa</label>
                <select className="select" value={mesaId} onChange={e => setMesaId(e.target.value)}>
                  <option value="">Seleccionar mesa</option>
                  {mesas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            )}

            {tipo === 'domicilio' && (
              <>
                <div className="form-group">
                  <label className="label">Teléfono</label>
                  <input className="input" type="tel" placeholder="300 000 0000" value={telefono} onChange={e => setTelefono(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Dirección / Referencia</label>
                  <input className="input" placeholder="Solo para domicilio" value={direccion} onChange={e => setDireccion(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* MENÚ */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>Menú</h3></div>
          <div className="card-body">
            <div className="form-group">
              <input className="input" placeholder="🔍  Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ marginBottom: 12 }} />
            </div>

            <div className="cats-scroll">
              <button className={`cat-btn ${catActiva === 'todos' ? 'active' : ''}`} onClick={() => setCatActiva('todos')}>Todos</button>
              {categorias.map(c => (
                <button key={c.id} className={`cat-btn ${catActiva == c.id ? 'active' : ''}`} onClick={() => setCatActiva(c.id)}>
                  {c.icono} {c.nombre}
                </button>
              ))}
            </div>

            {productosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>Sin productos</div>
            ) : (
              <div className="productos-grid">
                {productosFiltrados.map(p => (
                  <div key={p.id} className="prod-card" onClick={() => agregar(p)}>
                    <div className="prod-card-img">
                      {p.imagen_url ? <img src={p.imagen_url} alt={p.nombre} /> : <span>{p.categoria_icono || '🍽️'}</span>}
                    </div>
                    <div className="prod-card-body">
                      <div className="prod-card-name">{p.nombre}</div>
                      {p.descripcion && <div className="prod-card-desc">{p.descripcion}</div>}
                      <div className="prod-card-footer">
                        <div className="prod-card-price">{fmt(p.precio_venta)}</div>
                        <button className="btn-add-prod" onClick={e => { e.stopPropagation(); agregar(p) }}>+</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CARRITO */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div>
              <h3>Pedido actual</h3>
              <p>{carrito.reduce((s, x) => s + x.cantidad, 0)} productos</p>
            </div>
            {carrito.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('¿Vaciar el pedido?')) setCarrito([]) }}>Vaciar</button>
            )}
          </div>
          <div className="card-body">
            {carrito.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>Agrega productos del menú</div>
            ) : (
              carrito.map(it => (
                <div key={it.id} className="carrito-item">
                  <div className="carrito-ctrl">
                    <button onClick={() => cambiarQty(it.id, -1)}>−</button>
                    <span className="qty">{it.cantidad}</span>
                    <button onClick={() => cambiarQty(it.id, 1)}>+</button>
                  </div>
                  <span className="carrito-name">{it.nombre}</span>
                  <span className="carrito-price">{fmt(it.precio_venta * it.cantidad)}</span>
                  <button className="carrito-remove" onClick={() => quitar(it.id)}>×</button>
                </div>
              ))
            )}

            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="label">Observaciones</label>
              <textarea className="textarea" placeholder="Ej. Sin cebolla, salsa aparte..." value={obs} onChange={e => setObs(e.target.value)} style={{ minHeight: 56 }} />
            </div>

            {carrito.length > 0 && (
              <div className="total-bar">
                <div>
                  <div className="total-bar-label">TOTAL</div>
                  <div className="total-bar-count">{carrito.reduce((s, x) => s + x.cantidad, 0)} productos</div>
                </div>
                <div className="total-bar-amount">{fmt(total)}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 8 }} />
      </div>

      {/* BOTÓN ENVIAR */}
      <div className="btn-enviar-pedido">
        <button onClick={enviarPedido} disabled={enviando || !carrito.length}>
          {enviando
            ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Enviando...</>
            : `✓ ENVIAR PEDIDO AL POS  ${carrito.length ? `(${fmt(total)})` : ''}`
          }
        </button>
      </div>
    </div>
  )
}
