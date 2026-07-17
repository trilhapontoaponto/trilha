import { supabase } from './supabase.js'

const HORAS_ATE_SIMULADO = 24
const DIAS_REVISAO_SE_BOM = 7
const NOTA_MINIMA_DOMINIO = 80

// Marca um tópico como estudado: cria o registro de estudo, agenda o simulado
// para daqui a 24h e coloca o desempenho em "aguardando_simulado".
export async function marcarComoEstudado(usuarioId, topicoId) {
  const dataAgendada = new Date()
  dataAgendada.setHours(dataAgendada.getHours() + HORAS_ATE_SIMULADO)

  await supabase.from('topicos_estudados').insert({
    usuario_id: usuarioId,
    topico_id: topicoId,
  })

  await supabase.from('simulados').insert({
    usuario_id: usuarioId,
    topico_id: topicoId,
    data_agendada: dataAgendada.toISOString(),
    status: 'pendente',
  })

  await supabase.from('desempenho_topico').upsert(
    {
      usuario_id: usuarioId,
      topico_id: topicoId,
      status: 'aguardando_simulado',
      proxima_acao_data: dataAgendada.toISOString(),
    },
    { onConflict: 'usuario_id,topico_id' }
  )
}

// Depois que o aluno responde um simulado agendado (por tópico): calcula a
// nota, grava as respostas e decide o próximo passo (revisão em 7 dias ou
// reforço imediato).
export async function finalizarSimulado(simulado, respostas) {
  const total = respostas.length
  const acertos = respostas.filter((r) => r.acertou).length
  const nota = total > 0 ? (acertos / total) * 100 : 0

  await supabase.from('respostas_simulado').insert(
    respostas.map((r) => ({
      simulado_id: simulado.id,
      questao_id: r.questaoId,
      resposta_aluno: r.respostaAluno,
      acertou: r.acertou,
    }))
  )

  await supabase
    .from('simulados')
    .update({ status: 'feito', nota })
    .eq('id', simulado.id)

  const dominou = nota >= NOTA_MINIMA_DOMINIO
  const proximaAcao = new Date()

  if (dominou) {
    proximaAcao.setDate(proximaAcao.getDate() + DIAS_REVISAO_SE_BOM)
  } else {
    proximaAcao.setHours(proximaAcao.getHours() + HORAS_ATE_SIMULADO)
    // nota baixa: agenda outro simulado do mesmo ponto
    await supabase.from('simulados').insert({
      usuario_id: simulado.usuario_id,
      topico_id: simulado.topico_id,
      data_agendada: proximaAcao.toISOString(),
      status: 'pendente',
    })
  }

  await supabase.from('desempenho_topico').upsert(
    {
      usuario_id: simulado.usuario_id,
      topico_id: simulado.topico_id,
      ultima_nota: nota,
      status: dominou ? 'dominado' : 'reforcar',
      proxima_acao_data: proximaAcao.toISOString(),
    },
    { onConflict: 'usuario_id,topico_id' }
  )

  return { nota, dominou }
}

// Lista as matérias disponíveis para "Resolver questões".
// OBS: por enquanto busca todas as matérias sem filtrar por concurso do aluno.
export async function listarMaterias() {
  const { data, error } = await supabase
    .from('materias')
    .select('id, nome')
    .order('nome')

  if (error) throw error
  return data || []
}

// Sorteia N questões ativas de qualquer tópico pertencente à matéria escolhida.
// Cada questão retorna com o id do seu tópico real (necessário para atualizar
// o desempenho granular ao finalizar o exercício) e a explicação, se houver.
export async function buscarQuestoesPorMateria(materiaId, quantidade) {
  const { data, error } = await supabase
    .from('questoes')
    .select('id, enunciado, gabarito, explicacao, topicos!inner(id, nome, materia_id)')
    .eq('topicos.materia_id', materiaId)
    .eq('ativo', true)

  if (error) throw error

  const todas = data || []
  for (let i = todas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[todas[i], todas[j]] = [todas[j], todas[i]]
  }

  return todas.slice(0, quantidade)
}

// Busca todas as questões ativas de um único tópico (usado para praticar um
// tópico específico sob demanda, sem depender de um simulado pré-agendado —
// por exemplo, a partir de "tópicos a revisar" no Dashboard).
export async function buscarQuestoesPorTopico(topicoId) {
  const { data, error } = await supabase
    .from('questoes')
    .select('id, enunciado, gabarito, explicacao, topicos!inner(id, nome, materia_id)')
    .eq('topico_id', topicoId)
    .eq('ativo', true)

  if (error) throw error
  return data || []
}

// Finaliza uma sessão de "Resolver questões" (por matéria ou restrita a um
// único tópico — nesse caso o materiaId ainda é necessário para o registro
// em exercicios_materia). Cada resposta atualiza o desempenho_topico do
// tópico real da questão, mesmo numa sessão que mistura vários tópicos —
// nenhuma resposta certa ou errada fica de fora do cálculo de desempenho.
export async function finalizarExercicioMateria({ usuarioId, materiaId, respostas }) {
  const total = respostas.length
  const acertos = respostas.filter((r) => r.acertou).length
  const nota = total > 0 ? (acertos / total) * 100 : 0

  const { data: exercicio, error: erroExercicio } = await supabase
    .from('exercicios_materia')
    .insert({
      usuario_id: usuarioId,
      materia_id: materiaId,
      total_questoes: total,
      acertos,
      nota,
    })
    .select()
    .single()

  if (erroExercicio) throw erroExercicio

  await supabase.from('respostas_exercicio_materia').insert(
    respostas.map((r) => ({
      exercicio_id: exercicio.id,
      questao_id: r.questaoId,
      resposta_aluno: r.respostaAluno,
      acertou: r.acertou,
    }))
  )

  const porTopico = {}
  for (const r of respostas) {
    if (!porTopico[r.topicoId]) porTopico[r.topicoId] = []
    porTopico[r.topicoId].push(r)
  }

  for (const [topicoId, grupo] of Object.entries(porTopico)) {
    const totalGrupo = grupo.length
    const acertosGrupo = grupo.filter((r) => r.acertou).length
    const notaGrupo = (acertosGrupo / totalGrupo) * 100
    const dominouGrupo = notaGrupo >= NOTA_MINIMA_DOMINIO
    const proximaAcao = new Date()

    if (dominouGrupo) {
      proximaAcao.setDate(proximaAcao.getDate() + DIAS_REVISAO_SE_BOM)
    } else {
      proximaAcao.setHours(proximaAcao.getHours() + HORAS_ATE_SIMULADO)
    }

    await supabase.from('desempenho_topico').upsert(
      {
        usuario_id: usuarioId,
        topico_id: Number(topicoId),
        ultima_nota: notaGrupo,
        status: dominouGrupo ? 'dominado' : 'reforcar',
        proxima_acao_data: proximaAcao.toISOString(),
      },
      { onConflict: 'usuario_id,topico_id' }
    )
  }

  return { nota, acertos, erros: total - acertos, total }
}

// Agenda uma revisão para a matéria inteira (não um tópico específico), na
// data/horário escolhidos pelo aluno.
export async function agendarRevisaoMateria(usuarioId, materiaId, dataAgendadaISO) {
  await supabase.from('revisoes_materia').insert({
    usuario_id: usuarioId,
    materia_id: materiaId,
    data_agendada: dataAgendadaISO,
    status: 'pendente',
  })
}

// Lista TODAS as revisões de matéria pendentes (passadas e futuras) — quem
// consome decide o que mostrar como "disponível agora" comparando
// data_agendada com a data atual.
export async function listarRevisoesMateriaTodas(usuarioId) {
  const { data, error } = await supabase
    .from('revisoes_materia')
    .select('id, materia_id, data_agendada, materias(nome)')
    .eq('usuario_id', usuarioId)
    .eq('status', 'pendente')
    .order('data_agendada')

  if (error) throw error
  return data || []
}

export async function marcarRevisaoMateriaFeita(revisaoId) {
  await supabase.from('revisoes_materia').update({ status: 'feito' }).eq('id', revisaoId)
}

// Resumo geral de desempenho do aluno em questões objetivas, somando as
// respostas dadas tanto em simulados por tópico quanto em exercícios por
// matéria. Também aponta em qual matéria o aluno mais erra, para sugerir
// prática direcionada.
export async function buscarResumoDesempenho(usuarioId) {
  const [{ data: viaSimulados, error: erro1 }, { data: viaExercicios, error: erro2 }] = await Promise.all([
    supabase
      .from('respostas_simulado')
      .select('acertou, simulados!inner(usuario_id), questoes(topicos(materia_id, materias(nome)))')
      .eq('simulados.usuario_id', usuarioId),
    supabase
      .from('respostas_exercicio_materia')
      .select('acertou, exercicios_materia!inner(usuario_id, materia_id, materias(nome))')
      .eq('exercicios_materia.usuario_id', usuarioId),
  ])

  if (erro1) throw erro1
  if (erro2) throw erro2

  const respostas = [
    ...(viaSimulados || []).map((r) => ({
      acertou: r.acertou,
      materiaId: r.questoes?.topicos?.materia_id,
      materiaNome: r.questoes?.topicos?.materias?.nome,
    })),
    ...(viaExercicios || []).map((r) => ({
      acertou: r.acertou,
      materiaId: r.exercicios_materia?.materia_id,
      materiaNome: r.exercicios_materia?.materias?.nome,
    })),
  ]

  const total = respostas.length
  const acertos = respostas.filter((r) => r.acertou).length
  const erros = total - acertos

  const errosPorMateria = {}
  for (const r of respostas) {
    if (!r.acertou && r.materiaId) {
      if (!errosPorMateria[r.materiaId]) {
        errosPorMateria[r.materiaId] = { materiaId: r.materiaId, materiaNome: r.materiaNome, erros: 0 }
      }
      errosPorMateria[r.materiaId].erros += 1
    }
  }

  const materiaSugerida = Object.values(errosPorMateria).sort((a, b) => b.erros - a.erros)[0] || null

  return { total, acertos, erros, materiaSugerida }
}
