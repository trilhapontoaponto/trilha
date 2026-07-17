import { useState } from 'react'
import { getUsuarioLogado } from './lib/auth.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  const [usuario, setUsuario] = useState(getUsuarioLogado())

  if (!usuario) {
    return <Login onEntrar={setUsuario} />
  }

  return <Dashboard usuario={usuario} onSair={() => setUsuario(null)} />
}
