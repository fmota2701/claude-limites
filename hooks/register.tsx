import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Janela, UsoModelo } from '../types'

const janelas = atom({ plugin: 'limites', key: 'janelas' } as const, [], {
  shape: 'janelas-1',
})
const modelos = atom({ plugin: 'limites', key: 'modelos' } as const, [], {
  shape: 'modelos-1',
})
const agoraAtom = atom({ plugin: 'limites', key: 'agora' } as const, 0)
const atualizadoEm = atom({ plugin: 'limites', key: 'atualizadoEm' } as const, 0)
const atualizando = atom({ plugin: 'limites', key: 'atualizando' } as const, false)
const DIAS = 7
// Fuso de quem usa: o container da nuvem roda em UTC.
const FUSO = 'America/Sao_Paulo'
// De quanto em quanto tempo pedir uma leitura nova dos limites.
const INTERVALO_MS = 5 * 60000
type Diario = Record<string, Record<string, number>>

const NOMES: Record<string, string> = {
  five_hour: 'Sessão atual',
  seven_day: 'Esta semana',
}

function nome(kind: string): string {
  return NOMES[kind] ?? kind
}

function cor(p: number): string {
  return p >= 90 ? '#e0533d' : p >= 70 ? '#d4901f' : p >= 40 ? '#3b8beb' : '#2bb37a'
}

function nivel(p: number): string {
  return p >= 100 ? 'esgotado' : p >= 90 ? 'crítico' : p >= 70 ? 'atenção' : p >= 40 ? 'moderado' : 'tranquilo'
}

function faltam(resetsAt?: string, agora = Date.now()): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - agora
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'renova agora'
  const min = Math.round(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  const partes = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`
  return `renova em ${partes}`
}

function quando(resetsAt?: string): string {
  if (!resetsAt) return ''
  const t = new Date(resetsAt)
  if (Number.isNaN(t.getTime())) return ''
  let partes: Record<string, string> = {}
  try {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    })
    for (const p of fmt.formatToParts(t)) partes[p.type] = p.value
  } catch {
    partes = {}
  }
  if (partes.hour && partes.minute) {
    const dia = (partes.weekday ?? '').replace('.', '')
    const mesmoDia = t.getTime() - Date.now() < 20 * 3600000
    return mesmoDia ? `${partes.hour}:${partes.minute}` : `${dia} ${partes.hour}:${partes.minute}`
  }
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function haQuanto(t: number, agora: number): string {
  if (!t) return 'sem leitura'
  const min = Math.floor((agora - t) / 60000)
  return min <= 0 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h`
}

// Pixel art: '.' vazio, b corpo, d olho, h chapéu (cor do nível), w faixa do chapéu,
// p mastro, f bandeira, s brilho. Pernas e bandeira em quadros separados.
const CORPO = [
  '..........p...',
  '...hhhhh..p...',
  '..hhhwhhh.p...',
  '.hhhhhhhhhp...',
  '..bbbbbbb.p...',
  '..bdbbbdb.p...',
  'bbbbbbbbbbb...',
  'b.bbbbbbb.p...',
  '..bbbbbbb.....',
]
const PERNAS_A = ['..b.b.b.b.....', '..b.b.b.b.....']
const PERNAS_B = ['..b.b.b.b.....', '...b.b.b.b....']
const BANDEIRA_A = ['...........ff.', '...........fff', '...........ff.']
const BANDEIRA_B = ['...........fff', '...........ff.', '...........f..']
const BRILHO_A = ['s.............', '.s............']
const BRILHO_B = ['..............', 's.............']

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

function boneco(kind: string, percent: number): string {
  const chapeu = cor(percent)
  const cores: Record<string, string> = {
    b: '#e07b5a', d: '#1b1b1b', h: chapeu, w: '#f2f2f2', p: '#cfcfcf', f: '#f2f2f2', s: '#f2f2f2',
  }
  // Quanto mais perto do limite, mais rápido ele corre; esgotado, ele para.
  const passo = percent >= 100 ? 0 : percent >= 90 ? 0.25 : percent >= 70 ? 0.4 : 0.6
  const anima = passo > 0
  const flag = kind === 'five_hour'
  const extraA = flag ? pixels(BANDEIRA_A, 0, cores) : pixels(BRILHO_A, 3, cores)
  const extraB = flag ? pixels(BANDEIRA_B, 0, cores) : pixels(BRILHO_B, 3, cores)
  const corpo = flag ? CORPO : CORPO.map(r => r.replace(/p/g, '.'))
  const css = anima
    ? `.bob{animation:bob ${passo * 2}s steps(1) infinite}` +
      `@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}` +
      `.a{animation:a ${passo}s steps(1) infinite}@keyframes a{0%{opacity:1}50%{opacity:0}}` +
      `.b{animation:b ${passo}s steps(1) infinite}@keyframes b{0%{opacity:0}50%{opacity:1}}`
    : '.b{opacity:0}'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 14 13" width="36" height="34" shape-rendering="crispEdges">` +
    `<style>${css}</style>` +
    `<g class="bob">${pixels(corpo, 0, cores)}` +
    `<g class="a">${extraA}${pixels(PERNAS_A, 9, cores)}</g>` +
    `<g class="b">${extraB}${pixels(PERNAS_B, 9, cores)}</g></g></svg>`
  )
}


function ordenar(list: readonly Janela[]): Janela[] {
  const peso = (k: string) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : 2)
  return [...list].sort((a, b) => peso(a.kind) - peso(b.kind))
}


async function guardar($: EngineInterface, list: readonly Janela[]) {
  const copia = list.map(j => ({ kind: j.kind, percentUsed: j.percentUsed, resetsAt: j.resetsAt }))
  await update($, janelas, () => copia)
  const t = Date.now()
  await update($, atualizadoEm, () => t)
}

async function atualizar($: EngineInterface) {
  if (await read($, atualizando)) return
  await update($, atualizando, () => true)
  try {
    // Uma chamada mínima: a resposta da API traz a leitura atual dos limites.
    await $.model.complete({ model: 'haiku', prompt: 'ok', maxTokens: 1 })
    const u = await $.session.usage()
    if (u.rateLimits.length) await guardar($, u.rateLimits)
  } catch {
    // sem leitura nova; tenta de novo no próximo intervalo
  } finally {
    await update($, atualizando, () => false)
  }
}

async function tique($: EngineInterface) {
  const t = Date.now()
  await update($, agoraAtom, () => t)
  const ultima = await read($, atualizadoEm)
  if (t - ultima >= INTERVALO_MS) await atualizar($)
}

function dia(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

function nomeModelo(id: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(id)
  if (!m || !m[1] || !m[2]) return id
  const fam = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return `${fam} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

function corModelo(id: string): string {
  if (id.includes('opus')) return '#b48cf2'
  if (id.includes('sonnet')) return '#3b8beb'
  if (id.includes('haiku')) return '#2bb37a'
  if (id.includes('fable')) return '#e07b5a'
  return '#9a9a9a'
}

function barraFina(percent: number, fill: string): string {
  const w = percent <= 0 ? 0 : Math.max(6, Math.min(100, percent) * 10)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 6" width="1000" height="6" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="1000" height="6" rx="3" fill="#333333"/>` +
    `<rect x="0" y="0" width="${w}" height="6" rx="3" fill="${fill}"/></svg>`
  )
}

function somar(diario: Diario, agora: number): UsoModelo[] {
  const limite = dia(agora - (DIAS - 1) * 86400000)
  const total: Record<string, number> = {}
  for (const [d, porModelo] of Object.entries(diario)) {
    if (d < limite) continue
    for (const [m, n] of Object.entries(porModelo)) total[m] = (total[m] ?? 0) + n
  }
  return Object.entries(total)
    .map(([model, tokens]) => ({ model, tokens }))
    .sort((x, y) => y.tokens - x.tokens)
}

async function lerDiario($: EngineInterface): Promise<Diario> {
  const v = await $.store.get('diario')
  return v && typeof v === 'object' ? (v as Diario) : {}
}

async function registrarUso($: EngineInterface, model: string, tokens: number) {
  if (tokens <= 0) return
  const agora = Date.now()
  const hoje = dia(agora)
  const limite = dia(agora - (DIAS - 1) * 86400000)
  const diario = await lerDiario($)
  const novo: Diario = {}
  for (const [d, v] of Object.entries(diario)) if (d >= limite) novo[d] = { ...v }
  const doDia = novo[hoje] ?? {}
  doDia[model] = (doDia[model] ?? 0) + tokens
  novo[hoje] = doDia
  await $.store.set('diario', novo)
  const lista = somar(novo, agora)
  await update($, modelos, () => lista)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'limites',
      description: 'Escreve no chat o uso da janela de 5 horas e do limite semanal',
    })
    void $.ui.close({ id: 'limites' })
    $.ui.status(undefined)
    const lista = somar(await lerDiario($), Date.now())
    await update($, modelos, () => lista)
    const usage = await $.session.usage()
    if (usage.rateLimits.length) await guardar($, usage.rateLimits)
    await update($, atualizando, () => false)
    const t0 = Date.now()
    await update($, agoraAtom, () => t0)
    $.clock.every(30000, () => tique($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await guardar($, e.rateLimits)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      const tokens = u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0)
      await registrarUso($, u.model || e.model, tokens)
    }

    return r
  })

  on('command.run', { command: 'limites' }, async $ => {
    const list = ordenar(await read($, janelas))
    if (!list.length) return { text: 'Ainda sem leitura dos limites (aparece após a primeira resposta, só em planos de assinatura).' }

    return {
      text: list
        .map(j => `${nome(j.kind)}: ${j.percentUsed}% usado${j.resetsAt ? ` — ${faltam(j.resetsAt)} (${quando(j.resetsAt)})` : ''}`)
        .join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = ordenar(await read($, janelas))
    const usos = await read($, modelos)
    const agora = (await read($, agoraAtom)) || Date.now()
    const ultima = await read($, atualizadoEm)
    const ocupado = await read($, atualizando)
    if (e.props.hasSurvey || (!list.length && !usos.length)) return next(e)
    const totalTokens = usos.reduce((n, m) => n + m.tokens, 0)
    const top = usos.slice(0, 2)

    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined

    return (
      <Box flexDirection="row" width="100%" gap="lg">
        {list.map(j => {
          const p = Math.max(0, Math.min(100, j.percentUsed))
          const c = cor(j.percentUsed)
          return (
            <Box key={j.kind} flexDirection="row" width="35%" gap="sm" alignItems="center">
              {Svg && <Svg source={boneco(j.kind, j.percentUsed)} alt={`${nome(j.kind)}: ${nivel(j.percentUsed)}`} width={36} height={34} />}
              <Box flexDirection="column" flexGrow={1}>
                <Box flexDirection="row" justifyContent="space-between">
                  <Text>
                    <Text bold wrap="truncate-end">{nome(j.kind)}</Text>
                    <Text dimColor> · </Text>
                    <Text color={c}>{nivel(j.percentUsed)}</Text>
                  </Text>
                  <Text bold color={c}>{j.percentUsed}%</Text>
                </Box>
                <Box flexDirection="row" justifyContent="space-between">
                  <Text dimColor>{faltam(j.resetsAt, agora) || 'sem data de renovação'}</Text>
                  <Text dimColor>{quando(j.resetsAt)}</Text>
                </Box>
                {Svg ? (
                  <Svg source={barraFina(j.percentUsed, c)} alt={`${j.percentUsed}% usado`} />
                ) : (
                  <Box flexDirection="row" width="100%" height={1} backgroundColor="#2a2a2a">
                    <Box width={`${p}%`} height={1} backgroundColor={c} />
                  </Box>
                )}
              </Box>
            </Box>
          )
        })}
        <Box key="lado" flexDirection="column" width="30%">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Text dimColor>Modelos · 7 dias</Text>
            <Button
              key="atualizar"
              label={ocupado ? '↻ …' : `↻ ${haQuanto(ultima, agora)}`}
              onPress={() => atualizar($)}
            />
          </Box>
          {top.length === 0 && <Text dimColor>sem dados ainda</Text>}
            {top.map(m => {
              const pct = totalTokens ? Math.round((m.tokens / totalTokens) * 100) : 0
              const c = corModelo(m.model)
              return (
                <Box key={m.model} flexDirection="row" gap="sm" alignItems="center">
                  <Box width="38%">
                    <Text color={c} wrap="truncate-end">{nomeModelo(m.model)}</Text>
                  </Box>
                  <Box flexGrow={1}>
                    {Svg ? (
                      <Svg source={barraFina(pct, c)} alt={`${nomeModelo(m.model)}: ${pct}%`} />
                    ) : (
                      <Box flexDirection="row" width="100%" height={1} backgroundColor="#2a2a2a">
                        <Box width={`${pct}%`} height={1} backgroundColor={c} />
                      </Box>
                    )}
                  </Box>
                  <Text dimColor>{pct}%</Text>
                </Box>
              )
            })}
        </Box>
      </Box>
    )
  })
}
