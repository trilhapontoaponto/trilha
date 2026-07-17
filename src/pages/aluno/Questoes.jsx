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
  buscarResumoDesempenho,
} from '../../lib/topicos.js'

const QUANTIDADES = [3, 5, 7, 10]
const QUANTIDADE_REVISAO = 10
const QUANTIDADE_SUGESTAO = 5

// Enunciados de questões extraídas de provas reais podem trazer um prefixo
// "[Texto: fonte]" indicando de qual texto-base a assertiva depende.
function separarTextoApoio(enunciado) {
  const match = enunciado.match(/^\[Texto:\s*([^\]]+)\]\s*(.*)$/s)
  if (match) {
    return { fonte: match[1], assertiva: match[2] }
  }
  return { fonte: null, assertiva: enunciado }
}

// Lista de revisão pós-exercício: cada questão com certo/errado e a
// explicação, quando existir.
function ListaRevisao({ questoes, respostas }) {
  return (
    <div className="lista-revisao">
      <h2>Revisão das questões</h2>
      {questoes.map((q, i) => {
        const respostaAluno = respostas[q.id]
        const acertou = respostaAluno === q.gabarito
        const { fonte, assertiva } = separarTextoApoio(q.enunciado)
        return (
          <div key={q.id} className={`bloco-revisao ${acertou ? 'revisao-certa' : 'revisao-errada'}`}>
            {fonte && <p className="texto-apoio-tag">📖 {fonte}</p>}
            <p>{i + 1}. {assertiva}</p>
            <p className="revisao-status">
              {acertou ? '✔ Você acertou' : '✘ Você errou'} — resposta correta: {q.gabarito ? 'Certo' : 'Errado'}
            </p>
            {q.explicacao && <p className="revisao-explicacao">{q.explicacao}</p>}
          </div>
        )
      })}
    </div>
  )
}

export default function Questoes({ usuario }) {
  const [aba, setAba] = useState('agendados') // 'agendados' | 'resolver'

  // --- modo "agendados" (simulados por tópico + revisões de matéria) ---
  const [simulados, setSimulados] = useState([])
  const [revisoes, setRevisoes] = useState([])
  const [carregando, setCarregando] = useState(true)

  // --- resumo de desempenho + sugestão ---
  const [resumo, setResumo] = useState(null)

  // --- modo "resolver questões" (por matéria) ---
  const [materias, setMaterias] = useState([])
  const [materiaSelecionada, setMateriaSelecionada] = useState('')
  const [quantidadeSelecionada, setQuantidadeSelecionada] = useState(QUANTIDADES[0])
  const [gerando, setGerando] = useState(false)

  // --- exercício em andamento ---
  const [simuladoAtivo, setSimuladoAtivo] = useState(null)
  const [questoes, setQuestoes] = useState([])
  const [respostas, setRespostas] = useState({})
  const [resultado, setResultado] = useState(null)
  const [revisaoAgendada, setRevisaoAgendada] = useState(false)

  async function carregarPendentes() {
    setCarregando(true)
    const [{ data: dadosSimulados }, dadosRevisoes, dadosResumo] = await Promise.all([
      supabase
        .from('simulados')
        .select('id, topico_id, data_agendada, topicos(nome, materias(nome))')
        .eq('usuario_id', usuario.id)
        .eq('status', 'pendente')
        .lte('data_agendada', new Date().toISOString())
        .order('data_agendada'),
      listarRevisoesMateriaPendentes(usuario.id),
      buscarResumoDesempenho(usuario.id),
    ])

    setSimulados(dadosSimulados || [])
    setRevisoes(dadosRevisoes || [])
    setResumo(dadosResumo)
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
      .select('id, enunciado, gabarito, explicacao')
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

  // Atalho a partir da sugestão "você está errando mais em X" — já entra
  // direto na prática, sem precisar passar pela aba "Resolver questões".
  async function praticarMateriaSugerida() {
    if (!resumo?.materiaSugerida) return
    setGerando(true)
    const { materiaId, materiaNome } = resumo.materiaSugerida
    const sorteadas = await buscarQuestoesPorMateria(materiaId, QUANTIDADE_SUGESTAO)

    setMateriaSelecionada(materiaId)
    setSimuladoAtivo({
      tipo: 'materia',
      materiaId,
      nomeMateria: materiaNome,
      titulo: `Reforço — ${materiaNome}`,
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

          <ListaRevisao questoes={questoes} respostas={respostas} />
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

        <ListaRevisao questoes={questoes} respostas={respostas} />
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

  // Tela principal: resumo + abas "Agendados" / "Resolver questões"
  return (
    <div>
      <h1>Questões</h1>

      {resumo && resumo.total > 0 && (
        <>
          <div className="grade-cartoes resumo-cartoes">
            <div className="cartao">
              <span className="cartao-numero">{resumo.total}</span>
              <span>resolvidas</span>
            </div>
            <div className="cartao">
              <span className="cartao-numero">{resumo.acertos}</span>
              <span>acertos</span>
            </div>
            <div className="cartao cartao-erro">
              <span className="cartao-numero">{resumo.erros}</span>
              <span>erros</span>
            </div>
          </div>

          {resumo.materiaSugerida && (
            <div className="sugestao-erro">
              <p>
                Você está errando mais em <strong>{resumo.materiaSugerida.materiaNome}</strong>
                {' '}({resumo.materiaSugerida.erros} {resumo.materiaSugerida.erros === 1 ? 'erro' : 'erros'}).
              </p>
              <button onClick={praticarMateriaSugerida} disabled={gerando}>
                {gerando ? 'Gerando…' : 'Praticar agora'}
              </button>
            </div>
          )}
        </>
      )}

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
