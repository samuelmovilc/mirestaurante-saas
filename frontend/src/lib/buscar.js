// Búsqueda de productos: sin importar mayúsculas ni tildes ("cafe" encuentra "CAFÉ"),
// con varias palabras en cualquier orden ("soda mango"), y mirando nombre, descripción y categoría.
export const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function filtrarProductos(lista, texto, limite = Infinity) {
  const q = norm(texto)
  if (!q) return lista.slice(0, limite)
  const palabras = q.split(' ')
  const res = []
  for (const p of lista) {
    const nombre = norm(p.nombre)
    const todo = `${nombre} ${norm(p.descripcion)} ${norm(p.categoria_nombre)}`
    if (!palabras.every(w => todo.includes(w))) continue
    // Mejor puntaje = aparece antes y en el nombre.
    const rank = nombre.startsWith(q) ? 0 : nombre.includes(q) ? 1 : palabras.every(w => nombre.includes(w)) ? 2 : 3
    res.push([rank, p])
  }
  res.sort((a, b) => a[0] - b[0])
  return res.slice(0, limite).map(x => x[1])
}
