import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { Agente } from '../types'

const lista = atom({ plugin: 'agentes', key: 'lista' } as const, [], { shape: 'agentes-1' })
const agoraAtom = atom({ plugin: 'agentes', key: 'agora' } as const, 0)

// Por quanto tempo um agente que terminou continua na faixa.
const MOSTRAR_CONCLUIDO_MS = 30 * 60000
const MAX_CONCLUIDOS = 12
const PANE = 'agentes'
const TITULO = 'Agentes'

// ---------- formatação ----------

function tempo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}

function tokensCurto(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function nomeModelo(id: string): string {
  const m = /([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(id.replace(/^claude-/, ''))
  if (!m || !m[1] || !m[2]) return id || '—'
  return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

function corTipo(tipo: string): string {
  const t = tipo.toLowerCase()
  if (t.includes('explore')) return '#2bb37a'
  if (t.includes('plan')) return '#3b8beb'
  if (t.includes('general') || t === 'claude') return '#d4901f'
  if (t.includes('fork')) return '#b48cf2'
  const paleta = ['#e0533d', '#38b2ac', '#d66ba0', '#8fbf3f']
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return paleta[h % paleta.length] ?? '#9a9a9a'
}

function statusDe(s: AgentInfo['status']): Agente['status'] {
  if (s === 'completed') return 'concluido'
  if (s === 'failed') return 'falhou'
  if (s === 'killed') return 'parado'
  if (s === 'waiting' || s === 'idle' || s === 'pending') return 'esperando'
  return 'trabalhando'
}

const ATIVOS: ReadonlySet<Agente['status']> = new Set(['trabalhando', 'esperando'])

// ---------- desenhos ----------

const CORPO = [
  '..............',
  '...hhhhh......',
  '..hhhwhhh.....',
  '.hhhhhhhhh....',
  '..bbbbbbb.....',
  '..bdbbbdb.....',
  'bbbbbbbbbbb...',
  'b.bbbbbbb.b...',
  '..bbbbbbb.....',
]
const PERNAS_A = ['..b.b.b.b.....', '..b.b.b.b.....']
const PERNAS_B = ['..b.b.b.b.....', '...b.b.b.b....']
// ferramenta na mão enquanto trabalha; confete quando termina
const MARTELO_A = ['...........kk.', '...........kk.', '..........k...', '.........k....']
const MARTELO_B = ['..........kk..', '.........kk...', '..........k...', '.........k....']
const CONFETE = ['...........s.s', '............s.', '...........s.s', '..............']

function pixels(rows: readonly string[], top: number, cores: Record<string, string>): string {
  let out = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = cores[row.charAt(x)]
      if (fill) out += `<rect x="${x}" y="${y + top}" width="1.02" height="1.02" fill="${fill}"/>`
    }
  })
  return out
}

function boneco(a: Agente): string {
  const ativo = a.status === 'trabalhando'
  const parado = !ATIVOS.has(a.status)
  const cores: Record<string, string> = {
    b: parado && a.status !== 'concluido' ? '#8a5a4a' : '#e07b5a',
    d: '#1b1b1b', h: corTipo(a.tipo), w: '#f2f2f2', k: '#cfcfcf', s: '#f2d04a',
  }
  const css = ativo
    ? '.bob{animation:bob .8s steps(1) infinite}@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}' +
      '.a{animation:a .4s steps(1) infinite}@keyframes a{0%{opacity:1}50%{opacity:0}}' +
      '.b{animation:b .4s steps(1) infinite}@keyframes b{0%{opacity:0}50%{opacity:1}}'
    : a.status === 'esperando'
      ? '.bob{animation:bob 2s steps(1) infinite}@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}.b{opacity:0}'
      : '.b{opacity:0}'
  const extraA = a.status === 'concluido' ? pixels(CONFETE, 0, cores) : ATIVOS.has(a.status) ? pixels(MARTELO_A, 3, cores) : ''
  const extraB = ativo ? pixels(MARTELO_B, 3, cores) : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 14 13" width="36" height="34" shape-rendering="crispEdges">` +
    `<style>${css}</style><g class="bob">${pixels(CORPO, 0, cores)}` +
    `<g class="a">${extraA}${pixels(PERNAS_A, 9, cores)}</g>` +
    `<g class="b">${extraB}${pixels(PERNAS_B, 9, cores)}</g></g></svg>`
  )
}

function barra(a: Agente): string {
  const fundo = `<rect x="0" y="0" width="1000" height="6" rx="3" fill="#333333"/>`
  const c = a.status === 'falhou' ? '#e0533d' : a.status === 'parado' ? '#777777' : corTipo(a.tipo)
  const corpo = ATIVOS.has(a.status)
    ? `<style>.m{animation:m 1.6s ease-in-out infinite}@keyframes m{0%{transform:translateX(-300px)}100%{transform:translateX(1000px)}}</style>` +
      `<rect class="m" x="0" y="0" width="300" height="6" rx="3" fill="${c}"/>`
    : `<rect x="0" y="0" width="1000" height="6" rx="3" fill="${c}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 6" width="1000" height="6" preserveAspectRatio="none">${fundo}${corpo}</svg>`
}

// ---------- estado ----------

async function mudar($: EngineInterface, id: string, fn: (a: Agente) => Agente) {
  await update($, lista, l => l.map(a => (a.id === id ? fn(a) : a)))
}

function novo(id: string, tarefa: string, tipo: string, modelo: string, inicio: number): Agente {
  return { id, tarefa, tipo, modelo, status: 'trabalhando', ferramentas: 0, ultimaFerramenta: '', tokens: 0, inicio, fim: 0 }
}

async function sincronizar($: EngineInterface) {
  const agora = Date.now()
  const atual = await read($, lista)
  if (atual.length) await update($, agoraAtom, () => agora)
  let infos: AgentInfo[] = []
  try {
    infos = await $.agent.list()
  } catch {
    return
  }
  await update($, lista, l => {
    const porId = new Map(l.map(a => [a.id, a]))
    for (const i of infos) {
      const atual = porId.get(i.id)
      const status = statusDe(i.status)
      if (!atual) {
        if (!ATIVOS.has(status)) continue
        porId.set(i.id, novo(i.id, i.description || i.label, i.type, '', i.startTime || agora))
        continue
      }
      const fim = ATIVOS.has(status) ? 0 : atual.fim || agora
      if (atual.status !== status || atual.fim !== fim) porId.set(i.id, { ...atual, status, fim })
    }
    // some quem terminou há mais tempo que o limite
    return [...porId.values()].filter(a => ATIVOS.has(a.status) || agora - a.fim < MOSTRAR_CONCLUIDO_MS)
  })
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, agoraAtom, () => Date.now())
    $.clock.every(1000, () => sincronizar($))
    await $.command.register({ name: 'agentes', description: 'Abre o painel lateral com os agentes trabalhando' })
    void $.ui.open({ id: PANE, title: TITULO })

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) {
      const id = r.agentId
      const a = novo(id, e.description, e.subagentType || 'agente', r.model ?? '', Date.now())
      await update($, lista, l => [...l.filter(x => x.id !== id), a])
      void $.ui.open({ id: PANE, title: TITULO })
    }

    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      void mudar($, id, a => ({ ...a, ferramentas: a.ferramentas + 1, ultimaFerramenta: 'tool' in e ? String(e.tool) : '', status: 'trabalhando' }))
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const id = e.agentId
    const u = r.usage
    if (id && u) {
      const n = u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0)
      await mudar($, id, a => ({ ...a, tokens: a.tokens + n, modelo: u.model || a.modelo }))
    }

    return r
  })

  on('agent.report', async ($, e, next) => {
    const status: Agente['status'] = e.status === 'completed' ? 'concluido' : e.status === 'failed' ? 'falhou' : 'parado'
    const fim = Date.now()
    await mudar($, e.agentId, a => ({ ...a, status, fim }))

    return next(e)
  })

  on('command.run', { command: 'agentes' }, async $ => {
    await $.ui.open({ id: PANE, title: TITULO })

    return { text: 'Painel de agentes aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const todos = await read($, lista)
    const agora = (await read($, agoraAtom)) || Date.now()
    const ativos = todos.filter(a => ATIVOS.has(a.status)).sort((x, y) => x.inicio - y.inicio)
    const prontos = todos.filter(a => !ATIVOS.has(a.status)).sort((x, y) => y.fim - x.fim).slice(0, MAX_CONCLUIDOS)

    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const Svg = 'Svg' in els ? els.Svg : undefined

    const cartao = (a: Agente) => {
      const c = corTipo(a.tipo)
      const fim = ATIVOS.has(a.status) ? agora : a.fim
      const icone = a.status === 'concluido' ? '✓' : a.status === 'falhou' ? '✕' : a.status === 'parado' ? '■' : a.status === 'esperando' ? '◌' : '●'
      const corIcone = a.status === 'falhou' ? '#e0533d' : a.status === 'parado' ? '#777777' : c
      const acao = ATIVOS.has(a.status)
        ? a.ultimaFerramenta ? `${a.ferramentas} · ${a.ultimaFerramenta}` : a.status === 'esperando' ? 'esperando' : 'pensando'
        : a.status === 'concluido' ? `${a.ferramentas} ferramentas` : a.status === 'falhou' ? 'falhou' : 'parado'
      return (
        <Box key={a.id} flexDirection="row" gap="sm" alignItems="center" paddingY="xs">
          {Svg && <Svg source={boneco(a)} alt={`${a.tipo}: ${a.status}`} width={40} height={38} />}
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold wrap="truncate-end">{a.tarefa || a.tipo}</Text>
              <Text color={corIcone}>{icone}</Text>
            </Box>
            <Text wrap="truncate-end">
              <Text color={c}>{a.tipo}</Text>
              <Text dimColor> {nomeModelo(a.modelo)}</Text>
            </Text>
            <Box flexDirection="row" justifyContent="space-between">
              <Text wrap="truncate-end">{acao}</Text>
              <Text dimColor>{tokensCurto(a.tokens)} · {tempo(fim - a.inicio)}</Text>
            </Box>
            {Svg ? (
              <Svg source={barra(a)} alt={a.status} />
            ) : (
              <Text color={c}>{ATIVOS.has(a.status) ? '▰▱▱▱▱▱▱▱' : '▰▰▰▰▰▰▰▰'}</Text>
            )}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm">
        <Text dimColor>Trabalhando · {ativos.length}</Text>
        {ativos.length === 0 && <Text dimColor>Nenhum agente rodando agora.</Text>}
        {ativos.map(cartao)}
        {prontos.length > 0 && <Text dimColor>Concluídos · {prontos.length}</Text>}
        {prontos.map(cartao)}
      </Box>
    )
  })
}
