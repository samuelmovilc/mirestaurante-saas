import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'
import { getUsuarioGuardado, guardarSesion, borrarSesion } from '../lib/session'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const guardado = getUsuarioGuardado() // sesión de ESTE restaurante (nunca la de otro)
    if (guardado) setUsuario(guardado)
    setLoading(false)
  }, [])

  async function login(username, password) {
    const res = await api.login(username, password)
    guardarSesion(res.data.token, res.data.usuario)
    setUsuario(res.data.usuario)
    return res.data.usuario
  }

  function logout() {
    borrarSesion()
    setUsuario(null)
  }

  return (
    <AuthCtx.Provider value={{ usuario, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
