import { jsPDF } from 'jspdf'

export async function downloadFacturaPDF(p, mps, total, cambio, config) {
  const items = typeof p.items === 'string' ? JSON.parse(p.items || '[]') : (p.items || [])
  const height = 130 + (items.length * 8) + (mps ? mps.length * 5 : 0) + (config?.logo_url ? 25 : 0)
  const doc = new jsPDF({ unit: 'mm', format: [80, height] })
  
  let currentY = 10

  if (config?.logo_url) {
    try {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.src = config.logo_url
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')
      
      doc.addImage(dataUrl, 'PNG', 25, currentY, 30, 30) // X=25 centers a 30x30 logo on 80mm width
      currentY += 35
    } catch (e) {
      console.error('Error loading logo for PDF', e)
    }
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(config?.nombre_negocio || "FACTURA", 40, currentY, { align: "center" })
  
  currentY += 6
  
  if (config?.nit_negocio) {
    doc.setFontSize(9)
    doc.text(`NIT: ${config.nit_negocio}`, 40, currentY, { align: "center" })
    currentY += 6
  }
  
  doc.setFontSize(10)
  doc.text("FACTURA DE VENTA", 40, currentY, { align: "center" })
  currentY += 8
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Orden: #${p.numero_pedido || p.num || p.id || 'S/N'}`, 5, currentY)
  currentY += 4
  doc.text(`Fecha: ${new Date(p.created_at || Date.now()).toLocaleString('es-CO')}`, 5, currentY)
  currentY += 4
  doc.text(`Cliente: ${p.nombre_cliente || 'N/A'}`, 5, currentY)
  currentY += 4
  if (p.mesa_nombre) {
    doc.text(`Mesa: ${p.mesa_nombre}`, 5, currentY)
    currentY += 4
  }
  if (p.tipo_pedido) {
    doc.text(`Tipo: ${p.tipo_pedido.toUpperCase()}`, 5, currentY)
    currentY += 4
  }
  
  doc.line(5, currentY, 75, currentY)
  currentY += 4
  doc.setFont("helvetica", "bold")
  doc.text("CANT", 5, currentY)
  doc.text("DESCRIPCION", 18, currentY)
  doc.text("TOTAL", 60, currentY)
  currentY += 2
  doc.line(5, currentY, 75, currentY)
  
  currentY += 5
  doc.setFont("helvetica", "normal")
  items.forEach(it => {
    doc.text(`${it.cantidad}`, 5, currentY)
    doc.text((it.nombre_producto||'').substring(0, 17), 15, currentY)
    const sub = parseFloat(it.precio_unitario || it.precio || 0) * parseInt(it.cantidad || 1)
    doc.text(`$${sub.toLocaleString('es-CO')}`, 60, currentY)
    currentY += 6
  })
  
  doc.line(5, currentY, 75, currentY)
  currentY += 5
  
  doc.setFont("helvetica", "bold")
  doc.text(`TOTAL A PAGAR: $${parseFloat(total || p.total || 0).toLocaleString('es-CO')}`, 5, currentY)
  currentY += 6
  
  if (mps && mps.length) {
    doc.setFont("helvetica", "normal")
    mps.forEach(m => {
      doc.text(`PAGO (${m.nombre}): $${parseFloat(m.monto||0).toLocaleString('es-CO')}`, 5, currentY)
      currentY += 5
    })
    if (cambio > 0) {
      doc.text(`CAMBIO: $${parseFloat(cambio||0).toLocaleString('es-CO')}`, 5, currentY)
      currentY += 5
    }
  }
  
  doc.setFont("helvetica", "normal")
  currentY += 2
  doc.text("¡Gracias por su compra!", 40, currentY, { align: "center" })
  currentY += 4
  doc.text("Vuelva pronto", 40, currentY, { align: "center" })
  
  doc.save(`Factura_Orden_${p.numero_pedido || p.id}.pdf`)
}

export function downloadComandasPDF(pedidosArray, config) {
  const height = 50 + (pedidosArray.length * 100) // approx
  const doc = new jsPDF({ unit: 'mm', format: [80, height] })
  
  let currentY = 10
  
  pedidosArray.forEach((p, index) => {
    if (index > 0) {
      doc.line(5, currentY, 75, currentY)
      currentY += 10
    }
    
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("COMANDA DE COCINA", 40, currentY, { align: "center" })
    currentY += 8
    
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(`Pedido: #${p.numero_pedido}`, 5, currentY); currentY += 5;
    doc.text(`Cliente: ${p.nombre_cliente || '—'}`, 5, currentY); currentY += 5;
    doc.text(`Tipo: ${p.tipo_pedido}${p.mesa_nombre ? ' - ' + p.mesa_nombre : ''}`, 5, currentY); currentY += 5;
    
    doc.line(5, currentY, 75, currentY); currentY += 5;
    
    doc.setFont("helvetica", "bold")
    doc.text("PRODUCTOS:", 5, currentY); currentY += 6;
    doc.setFont("helvetica", "normal")
    
    const items = typeof p.items === 'string' ? JSON.parse(p.items || '[]') : (p.items || [])
    items.forEach(it => {
      doc.text(`${it.cantidad}x ${it.nombre_producto}`, 5, currentY); currentY += 5;
      if (it.nota) {
        doc.setFontSize(8)
        doc.text(`  *Nota: ${it.nota}`, 5, currentY); currentY += 4;
        doc.setFontSize(10)
      }
    })
    
    if (p.observaciones) {
      currentY += 3
      doc.setFont("helvetica", "bold")
      doc.text("OBSERVACIONES:", 5, currentY); currentY += 5;
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      const splitObs = doc.splitTextToSize(p.observaciones, 70)
      doc.text(splitObs, 5, currentY)
      currentY += (splitObs.length * 4) + 5
    }
    
    currentY += 10
  })
  
  doc.save(`Comandas_${Date.now()}.pdf`)
}

export function downloadCuadrePDF(h, config) {
  const doc = new jsPDF({ unit: 'mm', format: [80, 150] })
  
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("CUADRE DE CAJA", 40, 10, { align: "center" })
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`Turno #${h.id}`, 40, 16, { align: "center" })
  
  let y = 24
  doc.setFontSize(9)
  doc.text(`Apertura: ${new Date(h.fecha_apertura).toLocaleString('es-CO')}`, 5, y); y += 4;
  doc.text(`Cierre: ${h.fecha_cierre ? new Date(h.fecha_cierre).toLocaleString('es-CO') : 'En curso'}`, 5, y); y += 4;
  doc.text(`Usr Apertura: ${h.usuario_apertura || '—'}`, 5, y); y += 4;
  doc.text(`Usr Cierre: ${h.usuario_cierre || '—'}`, 5, y); y += 6;
  
  doc.line(5, y, 75, y); y += 4;
  
  doc.setFont("helvetica", "bold")
  doc.text("Concepto", 5, y); 
  doc.text("Valor", 75, y, { align: "right" }); 
  y += 2;
  doc.line(5, y, 75, y); y += 5;
  
  doc.setFont("helvetica", "normal")
  doc.text("Saldo Inicial", 5, y);
  doc.text(`$${parseFloat(h.saldo_inicial||0).toLocaleString('es-CO')}`, 75, y, { align: "right" }); y += 5;
  
  doc.text("Ingresos (Ventas)", 5, y);
  doc.text(`$${parseFloat(h.ingresos||0).toLocaleString('es-CO')}`, 75, y, { align: "right" }); y += 5;
  
  if (h.ingresos_por_metodo && h.ingresos_por_metodo.length > 0) {
    doc.setFont("helvetica", "italic")
    h.ingresos_por_metodo.forEach(mp => {
      doc.text(`  - ${mp.metodo_nombre}`, 5, y);
      doc.text(`$${parseFloat(mp.total||0).toLocaleString('es-CO')}`, 75, y, { align: "right" }); y += 4;
    });
    doc.setFont("helvetica", "normal")
    y += 1;
  }
  
  doc.text("Gastos", 5, y);
  doc.text(`-$${parseFloat(h.gastos||0).toLocaleString('es-CO')}`, 75, y, { align: "right" }); y += 6;
  
  doc.line(5, y, 75, y); y += 5;
  
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("SALDO FINAL", 5, y);
  doc.text(`$${parseFloat(h.saldo_final_calculado||0).toLocaleString('es-CO')}`, 75, y, { align: "right" }); y += 10;
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("Sistema de Caja - Pollo POS", 40, y, { align: "center" })
  
  doc.save(`Cuadre_Caja_Turno_${h.id}.pdf`)
}
