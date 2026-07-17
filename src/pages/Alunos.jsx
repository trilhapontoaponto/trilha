import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { sha256 } from '../../lib/auth.js'

export default function Alunos() {
  const [alunos, setAlunos] = useState([])
  const [concursos, setConcursos] = useState([])
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [concursoId, setConcursoId] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const { data: listaAlunos } = await supabase
      .from('usuarios')
      .select('id, nome, email, ativo, concursos(nome)')
      .eq('perfil', 'aluno')
      .order('nome')
    setAlunos(listaAlunos || [])

    const { data: listaConcursos } = await supabase
      .from('concursos')
      .select('id, nome')
      .order('nome')
    setConcursos(listaConcursos || [])
    if (listaConcursos?.length) setConcursoId(String(listaConcursos[0].id))
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
      perfil: 'aluno',
      concurso_id: concursoId || null,
    })

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao cadastrar: ' + error.message)
      return
    }

    setNome('')
    setEmail('')
    setSenha('')
    setMensagem('Aluno cadastrado.')
    carregar()
  }

  async function alternarAtivo(aluno) {
    await supabase.from('usuarios').update({ ativo: !aluno.ativo }).eq('id', aluno.id)
    carregar()
  }

  return (
    <div>
      <h1>Alunos</h1>
      <p className="status">
        Cadastro manual por enquanto — no futuro isso também pode vir do site (autoinscrição).
      </p>

      <form className="form-linha" onSubmit={handleSubmit}>
        <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <input placeholder="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Senha inicial" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        <select value={concursoId} onChange={(e) => setConcursoId(e.target.value)}>
          {concursos.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Cadastrar'}</button>
      </form>

      {mensagem && <p className="status">{mensagem}</p>}

      <table className="tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Concurso</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {alunos.map((a) => (
            <tr key={a.id}>
              <td>{a.nome}</td>
              <td>{a.email}</td>
              <td>{a.concursos?.nome || '—'}</td>
              <td>{a.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                <button onClick={() => alternarAtivo(a)}>
                  {a.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
