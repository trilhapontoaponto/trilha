import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { sha256 } from '../../lib/auth.js'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [perfil, setPerfil] = useState('admin')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil, ativo')
      .order('perfil')
      .order('nome')
    setUsuarios(data || [])
  }

  useEffect(() => {
    carregar()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMensagem('')
    setSalvando(true)

    const senhaHash = await sha256(senha)
    const { error } = await supabase.from('usuarios').insert({
      nome,
      email,
      senha_hash: senhaHash,
      perfil,
    })

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao cadastrar: ' + error.message)
      return
    }

    setNome('')
    setEmail('')
    setSenha('')
    setMensagem('Usuário cadastrado.')
    carregar()
  }

  async function mudarPerfil(usuario, novoPerfil) {
    await supabase.from('usuarios').update({ perfil: novoPerfil }).eq('id', usuario.id)
    carregar()
  }

  async function alternarAtivo(usuario) {
    await supabase.from('usuarios').update({ ativo: !usuario.ativo }).eq('id', usuario.id)
    carregar()
  }

  return (
    <div>
      <h1>Usuários</h1>
      <p className="status">Controle de quem tem acesso ao sistema e com qual perfil.</p>

      <form className="form-linha" onSubmit={handleSubmit}>
        <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <input placeholder="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Senha inicial" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          <option value="admin">Admin</option>
          <option value="aluno">Aluno</option>
        </select>
        <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Cadastrar'}</button>
      </form>

      {mensagem && <p className="status">{mensagem}</p>}

      <table className="tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.perfil} onChange={(e) => mudarPerfil(u, e.target.value)}>
                  <option value="aluno">Aluno</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td>{u.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                <button onClick={() => alternarAtivo(u)}>
                  {u.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
