import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getUsuarioLogado } from './lib/auth.js'
import Login from './pages/Login.jsx'
import Layout from './components/Layout.jsx'
import Alunos from './pages/admin/Alunos.jsx'
import Usuarios from './pages/admin/Usuarios.jsx'
import Dashboard from './pages/aluno/Dashboard.jsx'
import MeuEdital from './pages/aluno/MeuEdital.jsx'
import Revisao from './pages/aluno/Revisao.jsx'
import Questoes from './pages/aluno/Questoes.jsx'

export default function App() {
  const [usuario, setUsuario] = useState(getUsuarioLogado())

  if (!usuario) {
    return <Login onEntrar={setUsuario} />
  }

  const inicio = usuario.perfil === 'admin' ? '/admin/alunos' : '/dashboard'

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout usuario={usuario} onSair={() => setUsuario(null)} />}>
          <Route path="/" element={<Navigate to={inicio} replace />} />

          {usuario.perfil === 'admin' ? (
            <>
              <Route path="/admin/alunos" element={<Alunos />} />
              <Route path="/admin/usuarios" element={<Usuarios />} />
            </>
          ) : (
            <>
              <Route path="/dashboard" element={<Dashboard usuario={usuario} />} />
              <Route path="/edital" element={<MeuEdital usuario={usuario} />} />
              <Route path="/revisao" element={<Revisao usuario={usuario} />} />
              <Route path="/questoes" element={<Questoes usuario={usuario} />} />
            </>
          )}

          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
