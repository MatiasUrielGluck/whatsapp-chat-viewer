const LINE_RE = /^(\d{1,2}\/\d{1,2}\/\d{4}),\s+(\d{1,2}:\d{2})\s*-\s*(.*)$/

const SYSTEM_BODIES = new Set([
  'Eliminaste este mensaje.',
  'Se eliminó este mensaje.',
  'Bloqueaste a esta persona. Toca para desbloquearla.',
])

function isSystem(m) {
  const b = m.b.trim()
  return (
    m.s === null ||
    SYSTEM_BODIES.has(b) ||
    b.startsWith('Los mensajes y las llamadas están cifrados') ||
    b.startsWith('Mensajes y llamadas están cifrados')
  )
}

export function parseChat(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const messages = []

  for (const raw of lines) {
    const m = LINE_RE.exec(raw)
    if (m) {
      const [, date, time, rest] = m
      let sender = null
      let body = rest
      const ci = rest.indexOf(': ')
      if (ci !== -1) {
        sender = rest.slice(0, ci).trim()
        body = rest.slice(ci + 2)
      }
      messages.push({ d: date, t: time, s: sender, b: body })
    } else if (messages.length) {
      messages[messages.length - 1].b += '\n' + raw
    }
  }

  const bubbles = []
  for (const m of messages) {
    if (isSystem(m)) {
      bubbles.push({ d: m.d, t: m.t, s: 'system', b: m.b })
      continue
    }
    const last = bubbles[bubbles.length - 1]
    if (last && last.s === m.s && last.s !== 'system') {
      last.b += '\n' + m.b
      last.t = m.t
    } else {
      bubbles.push({ d: m.d, t: m.t, s: m.s, b: m.b })
    }
  }

  return bubbles
}

export function participantsOf(bubbles) {
  const out = []
  for (const b of bubbles) {
    if (b.s && b.s !== 'system' && !out.includes(b.s)) out.push(b.s)
  }
  return out
}
