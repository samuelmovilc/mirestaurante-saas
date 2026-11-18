import { useState, useEffect, useMemo } from 'react'
import { api, fmt } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

const EMPTY = { nombre: '', descripcion: '', precio_venta: '', precio_costo: '', categoria_id: '', imagen_url: '', visible_formulario: 1, activo: 1, controla_stock: 0, stock: '', stock_minimo: '' }

const FILTROS0 = { q: '', cat: '', estado: '', stock: '', visible: '', orden: 'nombre' }
const TIPO_MOV = { venta: 'Venta', entrada: 'Entrada', salida: 'Salida', conteo: 'Conteo', inicial: 'Stock inicial', devolucion: 'Devolución', ajuste: 'Ajuste de pedido' }

const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

// Estado de inventario de un producto
function estadoStock(p) {
  if (!p.controla_stock) return 'sin_control'
  if (p.stock <= 0) return 'agotado'
  if (p.stock <= p.stock_minimo) return 'bajo'
  return 'ok'
}

export default function ProductosAdmin() {
  const { toast, ToastContainer } = useToast()
  const [productos, setProductos]   = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [editId, setEditId]         = useState(null)
  const [guardando, setGuardando]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [subiendoImg, setSubiendoImg] = useState(false)
  const [filtros, setFiltros]       = useState(FILTROS0)
  const [ajuste, setAjuste]         = useState(null) // { p, tipo, cantidad, nota, movs, guardando }
  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

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

  function abrirNuevo() { setForm(EMPTY); setEditId(null); setModal(true) }
  function abrirEditar(p) {
    setForm({ nombre: p.nombre, descripcion: p.descripcion || '', precio_venta: p.precio_venta, precio_costo: p.precio_costo, categoria_id: p.categoria_id || '', imagen_url: p.imagen_url || '', visible_formulario: p.visible_formulario, activo: p.activo, controla_stock: p.controla_stock ? 1 : 0, stock: p.stock ?? 0, stock_minimo: p.stock_minimo ?? 0 })
    setEditId(p.id)
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre || !form.precio_venta) return toast('Nombre y precio de venta son requeridos', 'error')
    setGuardando(true)
    try {
      const payload = { ...form, precio_venta: parseFloat(form.precio_venta), precio_costo: parseFloat(form.precio_costo || 0), categoria_id: form.categoria_id || null,
        controla_stock: form.controla_stock ? 1 : 0, stock: Math.max(0, parseInt(form.stock) || 0), stock_minimo: Math.max(0, parseInt(form.stock_minimo) || 0) }
      if (editId) await api.updateProducto(editId, payload)
      else        await api.createProducto(payload)
      toast(editId ? 'Producto actualizado' : 'Producto creado')
      setModal(false)
      cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setSubiendoImg(true)
    try {
      const res = await api.uploadImage(file)
      setForm(f => ({ ...f, imagen_url: res.data.url }))
      toast('Imagen subida correctamente')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubiendoImg(false)
      e.target.value = ''
    }
  }

  // ── Filtros dinámicos: se aplican al instante, sin botón ──
  const lista = useMemo(() => {
    const q = norm(filtros.q)
    const r = productos.filter(p => {
      if (q && !norm(`${p.nombre} ${p.descripcion || ''} ${p.categoria_nombre || ''}`).includes(q)) return false
      if (filtros.cat === 'sin' ? p.categoria_id : (filtros.cat && String(p.categoria_id) !== filtros.cat)) return false
      if (filtros.estado && String(p.activo ? 1 : 0) !== filtros.estado) return false
      if (filtros.visible && String(p.visible_formulario ? 1 : 0) !== filtros.visible) return false
      if (filtros.stock && estadoStock(p) !== filtros.stock) return false
      return true
    })
    const ord = {
      nombre:   (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
      vendidos: (a, b) => (b.vendidos || 0) - (a.vendidos || 0),
      stock:    (a, b) => (a.controla_stock ? a.stock : Infinity) - (b.controla_stock ? b.stock : Infinity),
      precio:   (a, b) => b.precio_venta - a.precio_venta,
    }[filtros.orden]
    return ord ? [...r].sort(ord) : r
  }, [productos, filtros])

  const resumen = useMemo(() => ({
    agotados: productos.filter(p => estadoStock(p) === 'agotado').length,
    bajos:    productos.filter(p => estadoStock(p) === 'bajo').length,
    controlados: productos.filter(p => p.controla_stock).length,
    vendidos: productos.reduce((s, p) => s + Number(p.vendidos || 0), 0),
  }), [productos])
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(FILTROS0)

  async function abrirAjuste(p) {
    setAjuste({ p, tipo: 'entrada', cantidad: '', nota: '', movs: null, guardando: false })
    try { const r = await api.movimientosStock(p.id); setAjuste(a => a && a.p.id === p.id ? { ...a, movs: r.data || [] } : a) }
    catch { setAjuste(a => a ? { ...a, movs: [] } : a) }
  }
  async function guardarAjuste() {
    const a = ajuste
    if (a.cantidad === '' || isNaN(a.cantidad)) return toast('Ingresa la cantidad', 'error')
    setAjuste(x => ({ ...x, guardando: true }))
    try {
      const r = await api.ajustarStock(a.p.id, { tipo: a.tipo, cantidad: parseInt(a.cantidad), nota: a.nota })
      toast(`Stock de ${a.p.nombre}: ${r.data.stock}`)
      setAjuste(null); cargar()
    } catch (e) { toast(e.message, 'error'); setAjuste(x => x && { ...x, guardando: false }) }
  }

  async function eliminar(id, nombre) {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    try { const r = await api.deleteProducto(id); toast(r?.data?.desactivado ? 'Tiene ventas asociadas: se desactivó en lugar de borrarse' : 'Producto eliminado'); cargar() }
    catch (e) { toast(e.message, 'error') }
  }

  const ENCABEZADO = ['Nombre', 'Categoría', 'Descripción', 'Precio Venta', 'Precio Costo', 'Visible (Si/No)', 'Estado (Activo/Inactivo)', 'Stock (vacío = sin control)', 'Avisar cuando queden']
  const ANCHOS = [36, 16, 50, 13, 13, 15, 24, 26, 20]

  // [nombre, categoría, descripción, venta, costo]
  const COMBOS_BASE = [
    ['Combo Mojito + Helado', 'Combos', 'Mojito clásico con copa de helado de vainilla', 28000, 11000],
    ['Combo Piña Colada + Helado de Coco', 'Combos', 'Piña colada con helado de coco', 30000, 12000],
    ['Combo Margarita + Helado de Limón', 'Combos', 'Margarita de limón con helado de limón', 29000, 11500],
    ['Combo Daiquirí Fresa + Helado', 'Combos', 'Daiquirí de fresa con helado de fresa', 28000, 11000],
    ['Combo Caipirinha + Helado Maracuyá', 'Combos', 'Caipirinha con helado de maracuyá', 29000, 11500],
    ['Combo Sangría + Helado', 'Combos', 'Copa de sangría con helado de vainilla', 32000, 13000],
    ['Combo Cóctel Sin Alcohol + Helado', 'Combos', 'Cóctel sin alcohol con bola de helado', 22000, 8500],
    ['Combo Pareja 2 Cócteles + 2 Helados', 'Combos', 'Dos cócteles a elección con dos copas de helado', 54000, 22000],
    ['Combo Mojito Maracuyá + Brownie', 'Combos', 'Mojito de maracuyá con brownie y helado', 33000, 13500],
    ['Combo Cóctel Frutal + Malteada', 'Combos', 'Cóctel frutal con malteada de helado', 31000, 12500],
  ]
  const COMBOS = COMBOS_BASE.map(r => [...r, 'Si', 'Activo', '', ''])

  const INSTRUCCIONES = [
    ['CÓMO LLENAR LA PLANTILLA'],
    [''],
    ['Escribe un producto por fila en la hoja "Productos" y súbela con el botón "Carga masiva (Excel)".'],
    [''],
    ['Nombre: obligatorio. Si ya existe un producto con ese nombre, esa fila se omite (no se duplica).'],
    ['Categoría: si no existe, se crea sola.'],
    ['Descripción: opcional.'],
    ['Precio Venta: obligatorio. Solo el número (24000). También sirve 24.000 o $ 24,000.'],
    ['Precio Costo: opcional. Se usa para el costeo.'],
    ['Visible (Si/No): "No" lo oculta del formulario de pedidos. Vacío = Si.'],
    ['Estado (Activo/Inactivo): vacío = Activo.'],
    ['Stock: déjalo vacío si NO quieres controlar inventario. Si pones un número, el stock se descuenta solo con cada pedido.'],
    ['Avisar cuando queden: solo con Stock. Cuando quedan esas unidades o menos, el producto sale como "Stock bajo".'],
    [''],
    ['Las filas cuyo nombre empieza por "(Ejemplo)" se ignoran: puedes dejarlas o borrarlas.'],
    ['Puedes cambiar el orden de las columnas o quitar las opcionales, pero no cambies los títulos.'],
  ]

  async function descargarExcel(filas, archivo, conInstrucciones = false) {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([ENCABEZADO, ...filas])
    ws['!cols'] = ANCHOS.map(wch => ({ wch }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    if (conInstrucciones) {
      const wi = XLSX.utils.aoa_to_sheet(INSTRUCCIONES); wi['!cols'] = [{ wch: 120 }]
      XLSX.utils.book_append_sheet(wb, wi, 'Instrucciones')
    }
    XLSX.writeFile(wb, archivo)
  }

  const descargarPlantilla = () => descargarExcel([
    ['(Ejemplo) Cerveza Águila', 'Bebidas', 'Botella 330 ml', 5000, 2800, 'Si', 'Activo', 48, 10],
    ['(Ejemplo) Combo Pollo', 'Combos', 'Cuarto de pollo con papas', 24000, 10000, 'Si', 'Activo', '', ''],
  ], 'plantilla_productos.xlsx', true)
  const descargarCombos = () => descargarExcel(COMBOS, 'combos_cocteleria_helados.xlsx')

  // Parser CSV que respeta campos entre comillas. Acepta coma o punto y coma (Excel en español guarda con ";").
  function parseCSVLine(line, sep) {
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === sep && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += c }
    }
    cols.push(cur.trim())
    return cols
  }

  // "24000", "24.000", "$ 24,000" -> 24000 ; "8900.50" -> 8900.5
  function parsePrecio(v) {
    let t = String(v || '').replace(/[^0-9.,]/g, '')
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '')
    else t = t.replace(',', '.')
    const n = parseFloat(t)
    return Number.isFinite(n) ? n : 0
  }

  // Lee el archivo (Excel o CSV) y devuelve las filas como arreglos de texto.
  async function leerFilas(file) {
    if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
        .map(r => r.map(c => (c === null || c === undefined) ? '' : String(c).trim()))
        .filter(r => r.some(c => c !== ''))
    }
    const texto = (await file.text()).replace(/^\uFEFF/, '')
    const lines = texto.split(/\r?\n/).filter(l => l.trim())
    const sep = (lines[0]?.match(/;/g) || []).length > (lines[0]?.match(/,/g) || []).length ? ';' : ','
    return lines.map(l => parseCSVLine(l, sep))
  }

  // Busca cada columna por su título (así el orden no importa). Si no reconoce los títulos, usa el orden de la plantilla.
  const CAMPOS = [['nombre', ['nombre', 'producto']], ['categoria', ['categoria']], ['descripcion', ['descripcion']], ['costo', ['costo']],
                  ['venta', ['venta', 'precio']], ['visible', ['visible']], ['estado', ['estado']], ['stock', ['stock']], ['minimo', ['avisar', 'minimo']]]
  const ORDEN_PLANTILLA = { nombre: 0, categoria: 1, descripcion: 2, venta: 3, costo: 4, visible: 5, estado: 6, stock: 7, minimo: 8 }
  function mapearColumnas(encabezado) {
    const t = encabezado.map(norm), usadas = new Set(), idx = {}
    for (const [campo, claves] of CAMPOS) {
      const i = t.findIndex((x, j) => !usadas.has(j) && claves.some(k => x.includes(k)))
      idx[campo] = i; if (i >= 0) usadas.add(i)
    }
    return (idx.nombre < 0 || idx.venta < 0) ? ORDEN_PLANTILLA : idx
  }

  const [progreso, setProgreso] = useState(null) // { fase, actual, total, nombre, importados, omitidos, errores }

  // Evita cerrar o recargar la página por accidente mientras se está cargando.
  useEffect(() => {
    if (!progreso || progreso.fase === 'fin') return
    const f = ev => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [progreso?.fase])

  async function importarArchivo(e) {
    const file = e.target.files[0]; e.target.value = ''
    if (!file || (progreso && progreso.fase !== 'fin')) return
    setImportResult(null)
    setProgreso({ fase: 'leyendo', actual: 0, total: 0, nombre: '', importados: 0, omitidos: 0, errores: 0 })
    try {
      const filas = await leerFilas(file)
      if (filas.length < 2) { setProgreso(null); return toast('Archivo vacío', 'error') }
      const idx = mapearColumnas(filas[0])
      // Categorías existentes; las que no existan se crean con el nombre del archivo.
      const cats = {}
      ;((await api.getCategorias()).data || []).forEach(c => { cats[norm(c.nombre)] = c.id })
      // Nombres que ya existen: esas filas se omiten para no duplicar.
      const existentes = new Set(((await api.getProductos()).data || []).map(p => norm(p.nombre)))
      let importados = 0, omitidos = 0; const errores = []
      const total = filas.slice(1).filter(cols => { const n = String(cols[idx.nombre] ?? '').trim(); return n && !/^\(ejemplo\)/i.test(n) }).length
      let hechos = 0
      const avanzar = nombre => { hechos++; setProgreso({ fase: 'cargando', actual: hechos, total, nombre, importados, omitidos, errores: errores.length }) }
      setProgreso({ fase: 'cargando', actual: 0, total, nombre: '', importados: 0, omitidos: 0, errores: 0 })
      for (let i = 1; i < filas.length; i++) {
        const cols = filas[i]
        const c = k => (idx[k] >= 0 && idx[k] !== undefined) ? String(cols[idx[k]] ?? '').trim() : ''
        const nombre = c('nombre')
        if (!nombre || /^\(ejemplo\)/i.test(nombre)) continue
        setProgreso(pr => ({ ...pr, nombre }))
        const precio = parsePrecio(c('venta'))
        if (!precio) { errores.push(`Fila ${i + 1} (${nombre}): falta el precio de venta`); avanzar(nombre); continue }
        if (existentes.has(norm(nombre))) { omitidos++; avanzar(nombre); continue }
        try {
          let categoria_id = null
          const catNom = c('categoria')
          if (catNom) {
            if (!cats[norm(catNom)]) { const r = await api.createCategoria({ nombre: catNom, activo: 1 }); cats[norm(catNom)] = r.data.id }
            categoria_id = cats[norm(catNom)]
          }
          const visible = /^(no|0|false)$/i.test(norm(c('visible'))) ? 0 : 1
          const inactivo = /^inactiv/i.test(norm(c('estado')))
          const stockTxt = c('stock')
          const controla = stockTxt !== '' && !isNaN(parseInt(stockTxt))
          const data = { nombre, descripcion: c('descripcion') || null, categoria_id, precio_venta: precio, precio_costo: parsePrecio(c('costo')), imagen_url: null, visible_formulario: visible,
            ...(controla ? { controla_stock: 1, stock: Math.max(0, parseInt(stockTxt)), stock_minimo: Math.max(0, parseInt(c('minimo')) || 0) } : {}) }
          const r = await api.createProducto(data)
          if (inactivo) await api.updateProducto(r.data.id, { ...data, activo: 0 })
          existentes.add(norm(nombre))
          importados++
        } catch (err) { errores.push(`Fila ${i + 1} (${nombre}): ${err.message}`) }
        avanzar(nombre)
      }
      setProgreso({ fase: 'fin', actual: total, total, nombre: '', importados, omitidos, errores: errores.length })
      setImportResult({ importados, omitidos, errores })
      toast(`${importados} importados${omitidos ? ` · ${omitidos} ya existían` : ''}${errores.length ? ` · ${errores.length} con error` : ''}`, errores.length ? 'error' : undefined)
      cargar()
    } catch (err) { setProgreso(null); toast('No se pudo leer el archivo: ' + err.message, 'error') }
  }

  return (
    <div>
      <ToastContainer />
      <div className="page-header">
        <div><h2>Productos</h2><p>Catálogo del menú.</p></div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={descargarPlantilla}>Descargar plantilla Excel</button>
          <button className="btn btn-ghost" onClick={descargarCombos}>Descargar combos (Excel)</button>
          <button className="btn btn-dark" disabled={progreso && progreso.fase !== 'fin'} onClick={() => document.getElementById('csvImport').click()}>{progreso && progreso.fase !== 'fin' ? 'Cargando…' : 'Carga masiva (Excel)'}</button>
          <input type="file" id="csvImport" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={importarArchivo} />
          <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo producto</button>
        </div>
      </div>

      {progreso && progreso.fase !== 'fin' && (
        <div className="import-progress" role="status" aria-live="polite">
          <div className="import-progress-top">
            <span className="import-spin" aria-hidden="true" />
            <b>{progreso.fase === 'leyendo' ? 'Leyendo el archivo…' : `Cargando productos: ${progreso.actual} de ${progreso.total}`}</b>
            {progreso.fase === 'cargando' && progreso.total > 0 && <span className="import-pct">{Math.round(progreso.actual / progreso.total * 100)}%</span>}
          </div>
          <div className="import-bar"><div className={`import-bar-fill ${progreso.fase === 'leyendo' ? 'indet' : ''}`} style={progreso.fase === 'leyendo' ? undefined : { width: `${progreso.total ? progreso.actual / progreso.total * 100 : 0}%` }} /></div>
          <div className="import-progress-sub">
            {progreso.nombre ? <span className="import-now">{progreso.nombre}</span> : <span>Preparando…</span>}
            <span>✓ {progreso.importados} nuevos{progreso.omitidos ? ` · ${progreso.omitidos} ya existían` : ''}{progreso.errores ? ` · ${progreso.errores} con error` : ''}</span>
          </div>
          <div className="import-progress-warn">No cierres ni recargues esta página hasta que termine.</div>
        </div>
      )}
      {importResult && (
        <div style={{ background: 'var(--vd-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--vd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ {importResult.importados} producto(s) importados{importResult.omitidos ? ` · ${importResult.omitidos} ya existían (omitidos)` : ''}{importResult.errores?.length ? ` · ${importResult.errores.length} con error` : ''}</span>
          <button style={{ background: 'none', border: 'none', color: 'var(--vd)', cursor: 'pointer', fontSize: 16 }} onClick={() => setImportResult(null)}>×</button>
        </div>
      )}
      {importResult?.errores?.length > 0 && (
        <div style={{ border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--rd, #ef4444)' }}>
          {importResult.errores.slice(0, 10).map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}

      {/* RESUMEN DE INVENTARIO (las tarjetas de alerta también filtran) */}
      <div className="stats-grid stats-4 prod-stats">
        <div className="stat-card">
          <div className="stat-label">Productos</div>
          <div className="stat-value">{productos.length}</div>
          <div className="stat-sub">{resumen.controlados} con stock controlado</div>
        </div>
        <button type="button" className="stat-card stat-btn" onClick={() => setF('stock', filtros.stock === 'agotado' ? '' : 'agotado')} aria-pressed={filtros.stock === 'agotado'}>
          <div className="stat-label">Agotados</div>
          <div className="stat-value" style={{ color: resumen.agotados ? 'var(--rd)' : undefined }}>{resumen.agotados}</div>
          <div className="stat-sub">Ver solo agotados</div>
        </button>
        <button type="button" className="stat-card stat-btn" onClick={() => setF('stock', filtros.stock === 'bajo' ? '' : 'bajo')} aria-pressed={filtros.stock === 'bajo'}>
          <div className="stat-label">Stock bajo</div>
          <div className="stat-value" style={{ color: resumen.bajos ? '#b45309' : undefined }}>{resumen.bajos}</div>
          <div className="stat-sub">En o bajo el mínimo</div>
        </button>
        <div className="stat-card">
          <div className="stat-label">Unidades vendidas</div>
          <div className="stat-value">{resumen.vendidos}</div>
          <div className="stat-sub">Sin contar cancelados</div>
        </div>
      </div>

      {/* FILTROS DINÁMICOS */}
      <div className="filters-bar">
        <div className="filter-group fb-wide" style={{ flex: '1 1 220px' }}>
          <label className="filter-label" htmlFor="f-q">Buscar</label>
          <input id="f-q" className="filter-input" type="search" placeholder="Nombre, descripción o categoría…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-cat">Categoría</label>
          <select id="f-cat" className="filter-input" value={filtros.cat} onChange={e => setF('cat', e.target.value)}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
            <option value="sin">Sin categoría</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-stock">Stock</label>
          <select id="f-stock" className="filter-input" value={filtros.stock} onChange={e => setF('stock', e.target.value)}>
            <option value="">Todos</option>
            <option value="ok">Disponible</option>
            <option value="bajo">Stock bajo</option>
            <option value="agotado">Agotado</option>
            <option value="sin_control">Sin control</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-estado">Estado</label>
          <select id="f-estado" className="filter-input" value={filtros.estado} onChange={e => setF('estado', e.target.value)}>
            <option value="">Todos</option>
            <option value="1">Activos</option>
            <option value="0">Inactivos</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-vis">Visible</label>
          <select id="f-vis" className="filter-input" value={filtros.visible} onChange={e => setF('visible', e.target.value)}>
            <option value="">Todos</option>
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-ord">Ordenar por</label>
          <select id="f-ord" className="filter-input" value={filtros.orden} onChange={e => setF('orden', e.target.value)}>
            <option value="nombre">Nombre</option>
            <option value="vendidos">Más vendidos</option>
            <option value="stock">Menor stock</option>
            <option value="precio">Mayor precio</option>
          </select>
        </div>
        {hayFiltros && <button className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTROS0)}>Limpiar</button>}
      </div>

      <div className="card">
        <div className="card-header"><h3>Catálogo</h3><span style={{ fontSize: 12, color: 'var(--text3)' }}>{lista.length === productos.length ? `${productos.length} productos` : `${lista.length} de ${productos.length} productos`}</span></div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="table-wrap">
            <table className="tbl-prod">
              <thead>
                <tr><th>Imagen</th><th>Producto</th><th>Categoría</th><th>Precio venta</th><th>Precio costo</th><th>Stock</th><th>Vendidos</th><th>Descripción</th><th>Visible</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }} />
                        : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{p.categoria_icono || '🍽️'}</div>
                      }
                    </td>
                    <td><strong>{p.nombre}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.categoria_nombre || '—'}</td>
                    <td><strong style={{ color: 'var(--primary)' }}>{fmt(p.precio_venta)}</strong></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{fmt(p.precio_costo)}</td>
                    <td>
                      {(() => {
                        const e = estadoStock(p)
                        if (e === 'sin_control') return <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>Sin control</span>
                        if (e === 'agotado') return <span className="badge badge-red">Agotado</span>
                        return <span className={`badge ${e === 'bajo' ? 'badge-amber' : 'badge-green'}`} title={e === 'bajo' ? `En o bajo el mínimo (${p.stock_minimo})` : 'Disponible'}>{p.stock}{e === 'bajo' ? ' · bajo' : ''}</span>
                      })()}
                    </td>
                    <td><strong>{Number(p.vendidos || 0)}</strong></td>
                    <td style={{ fontSize: 11.5, color: 'var(--text3)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion || '—'}</td>
                    <td><span className={`badge ${p.visible_formulario ? 'badge-green' : 'badge-gray'}`}>{p.visible_formulario ? 'Sí' : 'No'}</span></td>
                    <td><span className={`badge ${p.activo ? 'badge-green' : 'badge-red'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => abrirEditar(p)}>Editar</button>
                        {p.controla_stock ? <button className="btn btn-ghost btn-xs" onClick={() => abrirAjuste(p)}>Stock</button> : null}
                        <button className="btn btn-danger btn-xs" onClick={() => eliminar(p.id, p.nombre)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!lista.length && <tr><td colSpan="11" style={{ textAlign: 'center', padding: 28, color: 'var(--text3)' }}>{productos.length ? 'Ningún producto coincide con los filtros' : 'Sin productos'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <h3>{editId ? 'Editar producto' : 'Nuevo producto'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="label">Nombre del producto *</label>
                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Combo 1/4 de Pollo" />
              </div>
              <div className="form-group">
                <label className="label">Categoría</label>
                <select className="select" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                  <option value="">Sin categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Descripción</label>
                <input className="input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción breve" />
              </div>
              <div className="form-group">
                <label className="label">Precio de venta *</label>
                <input className="input" type="number" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))} placeholder="24000" />
              </div>
              <div className="form-group">
                <label className="label">Precio de costo</label>
                <input className="input" type="number" value={form.precio_costo} onChange={e => setForm(f => ({ ...f, precio_costo: e.target.value }))} placeholder="12000" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="label">Imagen del producto</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={subiendoImg} className="input" style={{ padding: '4px' }} />
                  {subiendoImg && <span style={{ fontSize: 12, color: 'var(--primary)' }}>Subiendo...</span>}
                </div>
                <input className="input" value={form.imagen_url} onChange={e => setForm(f => ({ ...f, imagen_url: e.target.value }))} placeholder="O si prefieres, pega una URL (https://...)" />
                {form.imagen_url && <img src={form.imagen_url} alt="" style={{ marginTop: 8, height: 80, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)' }} />}
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.controla_stock} onChange={e => setForm(f => ({ ...f, controla_stock: e.target.checked ? 1 : 0 }))} />
                  Controlar stock de este producto
                </label>
                <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '4px 0 0' }}>Se descuenta solo con cada pedido y se devuelve si se cancela.</p>
              </div>
              {!!form.controla_stock && (
                <>
                  <div className="form-group">
                    <label className="label">{editId ? 'Stock actual' : 'Stock inicial'}</label>
                    <input className="input" type="number" min="0" value={form.stock} disabled={!!editId} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
                    {editId && <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 0' }}>Para cambiarlo usa el botón "Stock" de la lista.</p>}
                  </div>
                  <div className="form-group">
                    <label className="label">Avisar cuando queden</label>
                    <input className="input" type="number" min="0" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} placeholder="5" />
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="label">Estado</label>
                <select className="select" value={form.activo} onChange={e => setForm(f => ({ ...f, activo: parseInt(e.target.value) }))}>
                  <option value={1}>Activo</option>
                  <option value={0}>Inactivo</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Visible en formulario</label>
                <select className="select" value={form.visible_formulario} onChange={e => setForm(f => ({ ...f, visible_formulario: parseInt(e.target.value) }))}>
                  <option value={1}>Sí</option>
                  <option value={0}>No</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar producto'}</button>
            </div>
          </div>
        </div>
      )}

      {/* AJUSTE DE STOCK */}
      {ajuste && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAjuste(null)}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <h3>Stock · {ajuste.p.nombre}</h3>
            <div style={{ display: 'flex', gap: 18, margin: '4px 0 14px', fontSize: 13, color: 'var(--text2)' }}>
              <div>Disponible<div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{ajuste.p.stock}</div></div>
              <div>Vendidos<div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{Number(ajuste.p.vendidos || 0)}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="label" htmlFor="aj-tipo">Qué quieres hacer</label>
                <select id="aj-tipo" className="select" value={ajuste.tipo} onChange={e => setAjuste(a => ({ ...a, tipo: e.target.value }))}>
                  <option value="entrada">Entrada: llegó mercancía (suma)</option>
                  <option value="salida">Salida: merma o consumo (resta)</option>
                  <option value="conteo">Conteo: fijar la cantidad real</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="aj-cant">{ajuste.tipo === 'conteo' ? 'Cantidad real' : 'Cantidad'}</label>
                <input id="aj-cant" className="input" type="number" min="0" value={ajuste.cantidad} onChange={e => setAjuste(a => ({ ...a, cantidad: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="aj-nota">Nota (opcional)</label>
                <input id="aj-nota" className="input" value={ajuste.nota} onChange={e => setAjuste(a => ({ ...a, nota: e.target.value }))} placeholder="Compra proveedor…" />
              </div>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 0 6px' }}>Últimos movimientos</div>
            <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {ajuste.movs === null ? <div style={{ padding: 14, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                : !ajuste.movs.length ? <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>Aún no hay movimientos</div>
                : ajuste.movs.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ minWidth: 0 }}>
                      <strong>{TIPO_MOV[m.tipo] || m.tipo}</strong>{m.pedido_numero ? ` · pedido #${m.pedido_numero}` : ''}
                      <span style={{ color: 'var(--text3)' }}> · {new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {m.nota ? <span style={{ color: 'var(--text3)' }}> · {m.nota}</span> : null}
                    </span>
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: m.cantidad < 0 ? 'var(--rd)' : 'var(--vd)' }}>{m.cantidad > 0 ? '+' : ''}{m.cantidad} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>→ {m.stock_resultante}</span></span>
                  </div>
                ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setAjuste(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarAjuste} disabled={ajuste.guardando}>{ajuste.guardando ? 'Guardando...' : 'Guardar ajuste'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
