import { supabase } from './supabase.js'

const CHAVE_SESSAO = 'trilha_usuario'

async function sha256(texto) {
  const dados = new TextEncoder().encode(texto)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function login(email, senha) {
  const senhaHash = await sha256(senha)

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, email, nome, perfil, concurso_id, ativo')
    .eq('email', email)
    .eq('senha_hash', senhaHash)
    .eq('ativo', true)
    .single()

  if (error || !data) {
    throw new Error('E-mail ou senha inválidos.')
  }

  sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(data))
  return data
}

export function logout() {
  sessionStorage.removeItem(CHAVE_SESSAO)
}

export function getUsuarioLogado() {
  const bruto = sessionStorage.getItem(CHAVE_SESSAO)
  return bruto ? JSON.parse(bruto) : null
}
