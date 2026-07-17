import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { marcarComoEstudado } from '../../lib/topicos.js'

const ROTULO_STATUS = {
  nao_iniciado: 'Não iniciado',
  aguardando_simulado: 'Aguardando simulado',
  reforcar: 'Reforçar',
  dominado: 'Dominado',
}

export default function MeuEdital({ usuario }) {
  const [materias, setMaterias] = useState([])
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)

    const { data: materiasData } = await supabase
      .from('materias')
      .select('id, nome, ordem, topicos(id, nome, ordem, topico_pai_id)')
      .eq('concurso_id', usuario.concurso_id)
      .order('ordem')

    const { data: desempenhos } = await supabase
      .from('desempenho_topico')
      .select('topico_id, status')
      .eq('usuario_id', usuario.id)

    const statusPorTopico = Object.fromEntries(
      (desempenhos || []).map((d) => [d.topico_id, d.status])
    )

    const materiasMontadas = (materiasData || []).map((m) => {
      const todos = m.topicos || []
      const principais = todos
        .filter((t) => !t.topico_pai_id)
        .sort((a, b) => a.ordem - b.ordem)

      const arvore = principais.map((principal) => {
        const filhos = todos
          .filter((t) => t.topico_pai_id === principal.id)
          .sort((a, b) => a.ordem - b.ordem)
          .map((f) => ({ ...f, status: statusPorTopico[f.id] || 'nao_iniciado' }))

        return {
          ...principal,
          status: statusPorTopico[principal.id] || 'nao_iniciado',
          filhos,
        }
      })

      return { ...m, arvore }
    })

    setMaterias(materiasMontadas)
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [usuario.id, usuario.concurso_id])

  async function handleMarcar(topicoId) {
    await marcarComoEstudado(usuario.id, topicoId)
    carregar()
  }

  if (carregando) return <p className="status">Carregando edital…</p>

  if (materias.length === 0) {
    return (
      <div>
        <h1>Meu edital</h1>
        <p className="status">
          Nenhuma matéria cadastrada ainda para o seu concurso. Fale com o admin.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>Meu edital</h1>

      {materias.map((materia) => (
        <details key={materia.id} className="accordion-materia">
          <summary>
            <span>{materia.nome}</span>
            <span className="accordion-contagem">{materia.arvore.length} tópicos</span>
          </summary>

          {materia.arvore.length === 0 ? (
            <p className="status">Nenhum tópico cadastrado ainda.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tópico</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {materia.arvore.map((principal) => (
                  <>
                    <tr key={principal.id}>
                      <td className="linha-principal">{principal.nome}</td>
                      <td>{principal.filhos.length === 0 ? ROTULO_STATUS[principal.status] : '—'}</td>
                      <td>
                        {principal.filhos.length === 0 && principal.status === 'nao_iniciado' && (
                          <button onClick={() => handleMarcar(principal.id)}>
                            Marcar como estudado
                          </button>
                        )}
                      </td>
                    </tr>
                    {principal.filhos.map((filho) => (
                      <tr key={filho.id}>
                        <td className="linha-subtopico">{filho.nome}</td>
                        <td>{ROTULO_STATUS[filho.status]}</td>
                        <td>
                          {filho.status === 'nao_iniciado' && (
                            <button onClick={() => handleMarcar(filho.id)}>
                              Marcar como estudado
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </details>
      ))}
    </div>
  )
}
