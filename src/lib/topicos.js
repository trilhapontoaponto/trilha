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
// Quando o suporte multi-concurso estiver ativo na tela, filtrar aqui por
// usuario.concurso_id (ou equivalente) para não misturar matérias de provas
// diferentes.
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
// o desempenho granular ao finalizar o exercício).
export async function buscarQuestoesPorMateria(materiaId, quantidade) {
  const { data, error } = await supabase
    .from('questoes')
    .select('id, enunciado, gabarito, topicos!inner(id, nome, materia_id)')
    .eq('topicos.materia_id', materiaId)
    .eq('ativo', true)

  if (error) throw error

  const todas = data || []
  // embaralha (Fisher-Yates) e pega as N primeiras
  for (let i = todas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[todas[i], todas[j]] = [todas[j], todas[i]]
  }

  return todas.slice(0, quantidade)
}

// Finaliza uma sessão de "Resolver questões" por matéria (pode conter
// questões de vários tópicos diferentes). Grava a sessão inteira em
// exercicios_materia e, além disso, atualiza o desempenho_topico de CADA
// tópico que apareceu na sessão — assim toda resposta, certa ou errada,
// sempre conta para o desempenho real do aluno naquele ponto do edital, e a
// nota da matéria nunca fica "solta" sem refletir nos tópicos que a compõem.
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

  // Agrupa as respostas pelo tópico real de cada questão.
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

// Agenda uma revisão para a matéria inteira (não um tópico específico).
export async function agendarRevisaoMateria(usuarioId, materiaId, dias = DIAS_REVISAO_SE_BOM) {
  const dataAgendada = new Date()
  dataAgendada.setDate(dataAgendada.getDate() + dias)

  await supabase.from('revisoes_materia').insert({
    usuario_id: usuarioId,
    materia_id: materiaId,
    data_agendada: dataAgendada.toISOString(),
    status: 'pendente',
  })
}

// Lista as revisões de matéria pendentes e já no prazo.
export async function listarRevisoesMateriaPendentes(usuarioId) {
  const { data, error } = await supabase
    .from('revisoes_materia')
    .select('id, materia_id, data_agendada, materias(nome)')
    .eq('usuario_id', usuarioId)
    .eq('status', 'pendente')
    .lte('data_agendada', new Date().toISOString())
    .order('data_agendada')

  if (error) throw error
  return data || []
}

export async function marcarRevisaoMateriaFeita(revisaoId) {
  await supabase.from('revisoes_materia').update({ status: 'feito' }).eq('id', revisaoId)
}
