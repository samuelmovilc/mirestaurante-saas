import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Definimos la función que evalúa el tamaño de la ventana
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= breakpoint)
    }

    // Comprobar al montar
    checkIfMobile()

    // Suscribir al evento resize
    window.addEventListener('resize', checkIfMobile)
    
    // Limpiar evento al desmontar
    return () => window.removeEventListener('resize', checkIfMobile)
  }, [breakpoint])

  return isMobile
}
