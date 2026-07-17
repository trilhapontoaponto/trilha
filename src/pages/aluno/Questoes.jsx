import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import {
  finalizarSimulado,
  listarMaterias,
  buscarQuestoesPorMateria,
  finalizarExercicioMateria,
  agendarRevisaoMateria,
  listarRevisoesMateriaPendentes,
  marcarRevisaoMateriaFeita,
} from '../../lib/topicos.js'

const QUANTIDADES = [3, 5, 7, 10]
const QUANTIDADE_REVISAO = 10

// Enunciados de questões extraídas de provas reais podem trazer um prefixo
// "[Texto: fonte]" indicando de qual texto-base a assertiva depende.
// Isso separa esse prefixo do resto do enunciado para exibição destacada.
function separarTextoApoio(enunciado) {
  const match = enunciado.match(/^\[Texto:\s*([^\]]+)\]\s*(.*)$/s)
  if (match) {
    return { fonte: match[1], assertiva: match[2] }
  }
  return { fonte: null, assertiva: enunciado }
}

export default function Questoes({ usuario }) {
  const [aba, setAba] = useState('agendados') // 'agendados' | 'resolver'

  // --- modo "agendados" (simulados por tópico + revisões de matéria) ---
  const [simulados, setSimulados] = useState([])
  const [revisoes, setRevisoes] = useState([])
  const [carregando, setCarregando] = useState(true)

  // --- modo "resolver questões" (por matéria) ---
  const [materias, setMaterias] = useState([])
  const [materiaSelecionada, setMateriaSelecionada] = useState('')
  const [quantidadeSelecionada, setQuantidadeSelecionada] = useState(QUANTIDADES[0])
  const [gerando, setGerando] = useState(false)

  // --- exercício em andamento (agendado por tópico OU por matéria) ---
  // simuladoAtivo.tipo: 'topico' | 'materia'
  const [simuladoAtivo, setSimuladoAtivo] = useState(null)
  const [questoes, setQuestoes] = useState([])
  const [respostas, setRespostas] = useState({})
  const [resultado, setResultado] = useState(null)
  const [revisaoAgendada, setRevisaoAgendada] = useState(false)

  async function carregarPendentes() {
    setCarregando(true)
    const [{ data: dadosSimulados }, dadosRevisoes] = await Promise.all([
      supabase
        .from('simulados')
        .select('id, topico_id, data_agendada, topicos(nome, materias(nome))')
        .eq('usuario_id', usuario.id)
        .eq('status', 'pendente')
        .lte('data_agendada', new Date().toISOString())
        .order('data_agendada'),
      listarRevisoesMateriaPendentes(usuario.id),
    ])

    setSimulados(dadosSimulados || [])
    setRevisoes(dadosRevisoes || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregarPendentes()
  }, [usuario.id])

  useEffect(() => {
    listarMaterias().then((lista) => {
      setMaterias(lista)
      if (lista.length > 0) setMateriaSelecionada(lista[0].id)
    })
  }, [])

  async function iniciarSimuladoTopico(simulado) {
    const { data } = await supabase
      .from('questoes')
      .select('id, enunciado, gabarito')
      .eq('topico_id', simulado.topico_id)
      .eq('ativo', true)

    setSimuladoAtivo({ tipo: 'topico', ...simulado })
    setQuestoes(data || [])
    setRespostas({})
    setResultado(null)
    setRevisaoAgendada(false)
  }

  async function iniciarResolverQuestoes() {
    if (!materiaSelecionada) return
    setGerando(true)
    const sorteadas = await buscarQuestoesPorMateria(materiaSelecionada, quantidadeSelecionada)
    const nomeMateria = materias.find((m) => m.id === materiaSelecionada)?.nome

    setSimuladoAtivo({
      tipo: 'materia',
      materiaId: materiaSelecionada,
      nomeMateria,
      titulo: `Resolver questões — ${nomeMateria}`,
    })
    setQuestoes(sorteadas)
    setRespostas({})
    setResultado(null)
    setRevisaoAgendada(false)
    setGerando(false)
  }

  async function iniciarRevisaoMateria(revisao) {
    setGerando(true)
    const sorteadas = await buscarQuestoesPorMateria(revisao.materia_id, QUANTIDADE_REVISAO)
    const nomeMateria = revisao.materias?.nome

    setSimuladoAtivo({
      tipo: 'materia',
      materiaId: revisao.materia_id,
      revisaoId: revisao.id,
      nomeMateria,
      titulo: `Revisão — ${nomeMateria}`,
    })
    setQuestoes(sorteadas)
    setRespostas({})
    setResultado(null)
    setRevisaoAgendada(false)
    setGerando(false)
  }

  function responder(questaoId, valor) {
    setRespostas((prev) => ({ ...prev, [questaoId]: valor }))
  }

  async function handleFinalizar() {
    if (simuladoAtivo.tipo === 'materia') {
      const listaRespostas = questoes.map((q) => {
        const respostaAluno = respostas[q.id]
        return {
          questaoId: q.id,
          topicoId: q.topicos.id,
          respostaAluno,
          acertou: respostaAluno === q.gabarito,
        }
      })

      const res = await finalizarExercicioMateria({
        usuarioId: usuario.id,
        materiaId: simuladoAtivo.materiaId,
        respostas: listaRespostas,
      })

      if (simuladoAtivo.revisaoId) {
        await marcarRevisaoMateriaFeita(simuladoAtivo.revisaoId)
      }

      setResultado({ ...res, tipo: 'materia' })
      return
    }

    // tipo === 'topico'
    const listaRespostas = questoes.map((q) => {
      const respostaAluno = respostas[q.id]
      return {
        questaoId: q.id,
        respostaAluno,
        acertou: respostaAluno === q.gabarito,
      }
    })

    const res = await finalizarSimulado(
      { id: simuladoAtivo.id, usuario_id: usuario.id, topico_id: simuladoAtivo.topico_id },
      listaRespostas
    )
    setResultado({ ...res, tipo: 'topico' })
  }

  async function handleAgendarRevisao() {
    await agendarRevisaoMateria(usuario.id, simuladoAtivo.materiaId)
    setRevisaoAgendada(true)
  }

  function voltar() {
    setSimuladoAtivo(null)
    setResultado(null)
    setRevisaoAgendada(false)
    carregarPendentes()
  }

  if (carregando) return <p className="status">Carregando…</p>

  // Tela de resultado
  if (resultado) {
    if (resultado.tipo === 'materia') {
      return (
        <div>
          <h1>Resultado</h1>
          <div className="grade-cartoes resultado-cartoes">
            <div className="cartao">
              <span className="cartao-numero">{resultado.acertos}</span>
              <span>acertos</span>
            </div>
            <div className="cartao cartao-erro">
              <span className="cartao-numero">{resultado.erros}</span>
              <span>erros</span>
            </div>
            <div className="cartao">
              <span className="cartao-numero">{resultado.nota.toFixed(0)}%</span>
              <span>nota</span>
            </div>
          </div>

          {revisaoAgendada ? (
            <p className="status ok">Revisão da matéria agendada.</p>
          ) : (
            <button onClick={handleAgendarRevisao}>Agendar revisão da matéria</button>
          )}
          <button onClick={voltar}>Voltar</button>
        </div>
      )
    }

    return (
      <div>
        <h1>Resultado</h1>
        <p className={resultado.dominou ? 'status ok' : 'status erro'}>
          Nota: {resultado.nota.toFixed(0)}% — {resultado.dominou
            ? 'Tópico dominado! Revisão agendada para daqui a 7 dias.'
            : 'Precisa reforçar. Um novo simulado foi agendado para você.'}
        </p>
        <button onClick={voltar}>Voltar</button>
      </div>
    )
  }

  // Tela do exercício em andamento
  if (simuladoAtivo) {
    const todasRespondidas = questoes.length > 0 && questoes.every((q) => respostas[q.id] !== undefined)

    return (
      <div>
        <h1>{simuladoAtivo.titulo || simuladoAtivo.topicos?.nome}</h1>

        {questoes.length === 0 ? (
          <p className="status">Nenhuma questão cadastrada ainda para este tópico.</p>
        ) : (
          <>
            {questoes.map((q, i) => {
              const { fonte, assertiva } = separarTextoApoio(q.enunciado)
              return (
                <div key={q.id} className="bloco-questao">
                  {fonte && <p className="texto-apoio-tag">📖 {fonte}</p>}
                  <p>{i + 1}. {assertiva}</p>
                  <div className="opcoes-questao">
                    <button
                      className={respostas[q.id] === true ? 'opcao-selecionada' : ''}
                      onClick={() => responder(q.id, true)}
                    >
                      Certo
                    </button>
                    <button
                      className={respostas[q.id] === false ? 'opcao-selecionada' : ''}
                      onClick={() => responder(q.id, false)}
                    >
                      Errado
                    </button>
                  </div>
                </div>
              )
            })}
            <button onClick={handleFinalizar} disabled={!todasRespondidas}>
              Finalizar
            </button>
          </>
        )}
      </div>
    )
  }

  // Tela principal: abas "Agendados" / "Resolver questões"
  return (
    <div>
      <h1>Questões</h1>

      <div className="tabs">
        <button
          className={aba === 'agendados' ? 'tab-ativa' : ''}
          onClick={() => setAba('agendados')}
        >
          Agendados
        </button>
        <button
          className={aba === 'resolver' ? 'tab-ativa' : ''}
          onClick={() => setAba('resolver')}
        >
          Resolver questões
        </button>
      </div>

      {aba === 'agendados' && (
        <>
          {simulados.length === 0 && revisoes.length === 0 ? (
            <p className="status">Nenhum simulado ou revisão disponível no momento.</p>
          ) : (
            <>
              {simulados.length > 0 && (
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Matéria</th>
                      <th>Tópico</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulados.map((s) => (
                      <tr key={s.id}>
                        <td>{s.topicos?.materias?.nome}</td>
                        <td>{s.topicos?.nome}</td>
                        <td>
                          <button onClick={() => iniciarSimuladoTopico(s)}>Fazer simulado</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {revisoes.length > 0 && (
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Revisão de matéria</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisoes.map((r) => (
                      <tr key={r.id}>
                        <td>{r.materias?.nome}</td>
                        <td>
                          <button onClick={() => iniciarRevisaoMateria(r)} disabled={gerando}>
                            Fazer revisão
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}

      {aba === 'resolver' && (
        <div className="bloco-avulso">
          <label>
            Matéria
            <select
              value={materiaSelecionada}
              onChange={(e) => setMateriaSelecionada(Number(e.target.value))}
            >
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </label>

          <label>
            Quantidade de questões
            <select
              value={quantidadeSelecionada}
              onChange={(e) => setQuantidadeSelecionada(Number(e.target.value))}
            >
              {QUANTIDADES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <button onClick={iniciarResolverQuestoes} disabled={gerando || !materiaSelecionada}>
            {gerando ? 'Gerando…' : 'Começar'}
          </button>
        </div>
      )}
    </div>
  )
}
