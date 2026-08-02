import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import JSZip from 'jszip'
import { parseChat, participantsOf } from './lib/parser.js'
import { decodeBytes } from './lib/decode.js'
import { kindOf, mimeFor, extOf, isAttachment, escapeHtml, linkify } from './lib/media.js'

const ChatScroller = forwardRef((props, ref) => {
  const handleRef = (el) => {
    if (el && !el.dataset.invScroll) {
      el.dataset.invScroll = '1'
      el.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault()
          el.scrollTop -= e.deltaY
        },
        { passive: false },
      )
      el.addEventListener('keydown', (e) => {
        const k = e.key
        if (k === 'Home') {
          e.preventDefault()
          el.scrollTop = el.scrollHeight
          return
        }
        if (k === 'End') {
          e.preventDefault()
          el.scrollTop = 0
          return
        }
        let delta = 0
        if (k === 'ArrowDown') delta = -80
        else if (k === 'ArrowUp') delta = 80
        else if (k === 'PageDown') delta = -el.clientHeight * 0.9
        else if (k === 'PageUp') delta = el.clientHeight * 0.9
        else if (k === ' ') delta = el.clientHeight * 0.9 * (e.shiftKey ? 1 : -1)
        else return
        e.preventDefault()
        el.scrollTop += delta
      })
    }
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  return <div ref={handleRef} className="virtuoso" {...props} />
})

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fmtDate(d) {
  const [day, month, year] = d.split('/')
  return `${parseInt(day, 10)} de ${MONTHS[parseInt(month, 10) - 1]} de ${year}`
}

function escRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlight(escaped, q) {
  return escaped.replace(new RegExp(`(${escRegExp(q)})`, 'gi'), '<mark class="hl">$1</mark>')
}

async function loadItems(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.zip')) {
    let zip
    try {
      zip = await JSZip.loadAsync(file)
    } catch (e) {
      throw new Error('No se pudo leer el archivo como ZIP. Verificá que sea un export de WhatsApp.')
    }
    const items = []
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const basename = entry.name.split('/').pop()
      if (!basename) continue
      const data = await entry.async('uint8array')
      items.push({ path: entry.name, basename, ext: extOf(basename), data })
    }
    return items
  }
  const data = new Uint8Array(await file.arrayBuffer())
  const basename = file.name.split('/').pop()
  return [{ path: file.name, basename, ext: extOf(basename), data }]
}

function partnerFromName(name) {
  const m = /(?:\bChat de WhatsApp con\b|\bWhatsApp Chat with\b|\bWhatsApp Chat mit\b|\bChat WhatsApp avec\b)\s+(.+)$/i.exec(name)
  return m ? m[1].trim() : null
}

function autoYou(chat) {
  const partner = partnerFromName(chat.name)
  const others = chat.participants.filter(
    (s) => !partner || s.toLowerCase() !== partner.toLowerCase(),
  )
  return others.length ? others[0] : chat.participants[0] || ''
}

function Bubble({ b, you, media, onImage, q }) {
  const out = b.s === you
  const blocks = useMemo(() => {
    const out = []
    const lines = String(b.b).split('\n')
    for (const line of lines) {
      const file = isAttachment(line)
      if (file) {
        const item = media.get(file)
        if (!item) {
          out.push({ type: 'missing', file })
        } else if (item.kind === 'image') {
          out.push({ type: 'image', file, url: item.url })
        } else if (item.kind === 'sticker') {
          out.push({ type: 'sticker', file, url: item.url })
        } else if (item.kind === 'video') {
          out.push({ type: 'video', file, url: item.url })
        } else if (item.kind === 'audio') {
          out.push({ type: 'audio', file, url: item.url })
        } else {
          out.push({ type: 'link', file, url: item.url })
        }
      } else if (line.trim() === '<Multimedia omitido>') {
        out.push({ type: 'omitted' })
      } else if (line.trim() !== '') {
        const html = q ? highlight(escapeHtml(line), q) : linkify(escapeHtml(line))
        out.push({ type: 'text', html })
      }
    }
    return out
  }, [b.b, media, q])

  if (b.s === 'system') {
    return (
      <div className="row sys">
        <div className="bubble">
          {blocks.map((bl, i) =>
            bl.type === 'text' ? (
              <div key={i} className="sys-text" dangerouslySetInnerHTML={{ __html: bl.html }} />
            ) : null,
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`row ${out ? 'out' : 'in'}`}>
      {!out ? <div className="avatar-mini">{b.s.charAt(0)}</div> : null}
      <div className="bubble">
        {!out ? <div className="sender">{b.s}</div> : null}
        {blocks.map((bl, i) => {
          switch (bl.type) {
            case 'image':
              return (
                <img
                  key={i}
                  className="photo"
                  src={bl.url}
                  alt={bl.file}
                  loading="lazy"
                  onClick={() => onImage(bl.url, bl.file)}
                />
              )
            case 'sticker':
              return (
                <img
                  key={i}
                  className="sticker"
                  src={bl.url}
                  alt="sticker"
                  onClick={() => onImage(bl.url, bl.file)}
                />
              )
            case 'video':
              return <video key={i} className="video" controls preload="metadata" src={bl.url} />
            case 'audio':
              return <audio key={i} className="audio" controls preload="none" src={bl.url} />
            case 'link':
              return (
                <a key={i} className="file-link" href={bl.url} download={bl.file}>
                  📎 {bl.file}
                </a>
              )
            case 'missing':
              return <div key={i} className="media-omitted">🚫 {bl.file} (no disponible en el zip)</div>
            case 'omitted':
              return <div key={i} className="media-omitted">🎞️ Multimedia omitido</div>
            default:
              return (
                <div
                  key={i}
                  className="msg-text"
                  dangerouslySetInnerHTML={{ __html: bl.html }}
                />
              )
          }
        })}
        <div className="meta">
          <span className="ticks" style={out ? undefined : { color: 'var(--muted)' }}>
            {out ? '✓✓' : '✓'}
          </span>
          {b.t}
        </div>
      </div>
    </div>
  )
}

function DropZone({ onFile, busy, error }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  const [dragErr, setDragErr] = useState(null)

  const handle = (file) => {
    if (!file) return
    if (!/\.(zip|txt)$/i.test(file.name)) {
      setDragErr('El archivo tiene que ser un .zip de export de WhatsApp (o un .txt).')
      return
    }
    setDragErr(null)
    onFile(file)
  }

  return (
    <div className="dropzone-wrap">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          handle(e.dataTransfer.files?.[0])
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.txt"
          style={{ display: 'none' }}
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <div className="dz-icon">💬</div>
        <h2>{busy ? 'Procesando…' : 'Arrastrá acá el export de WhatsApp'}</h2>
        <p>
          {busy
            ? 'Descomprimiendo y parseando el chat…'
            : 'O hacé clic para seleccionar el archivo .zip. Todo se procesa en tu navegador, nada se sube a internet.'}
        </p>
        <div className="dz-hint">Se aceptan los exports que incluyen el .txt + audios/imágenes/videos/stickers</div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {dragErr ? <div className="error">{dragErr}</div> : null}
    </div>
  )
}

export default function App() {
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [chats, setChats] = useState([])
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState('')
  const [you, setYou] = useState('')
  const [dark, setDark] = useState(false)
  const [lb, setLb] = useState(null)
  const [showFab, setShowFab] = useState(false)
  const [searchIdx, setSearchIdx] = useState(0)
  const urlsRef = useRef([])
  const virtuosoRef = useRef(null)

  const chat = chats[active]

  useEffect(() => {
    if (!lb) return
    const onKey = (e) => {
      if (e.key === 'Escape') setLb(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lb])

  const processFile = useCallback(async (file) => {
    setError(null)
    setPhase('parsing')
    try {
      const items = await loadItems(file)
      const txts = items.filter((it) => it.ext === 'txt')
      if (!txts.length) {
        throw new Error('No se encontró ningún archivo .txt dentro del zip.')
      }

      urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      urlsRef.current = []

      const media = new Map()
      for (const it of items) {
        if (it.ext === 'txt') continue
        const kind = kindOf(it.basename)
        let url = null
        if (kind !== 'other') {
          url = URL.createObjectURL(new Blob([it.data], { type: mimeFor(it.ext, kind) }))
          urlsRef.current.push(url)
        }
        if (!media.has(it.basename)) media.set(it.basename, { url, kind, ext: it.ext })
      }

      const parsed = txts.map((txt) => {
        const bubbles = parseChat(decodeBytes(txt.data))
        return {
          name: txt.basename.replace(/\.txt$/i, ''),
          bubbles,
          participants: participantsOf(bubbles),
          media,
          mediaCount: media.size,
        }
      })

      setChats(parsed)
      setActive(0)
      setQuery('')
      setSearchIdx(0)
      setYou(autoYou(parsed[0]))
      setPhase('ready')
    } catch (e) {
      setError(e.message || String(e))
      setPhase('idle')
    }
  }, [])

  const reset = () => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
    setChats([])
    setActive(0)
    setQuery('')
    setSearchIdx(0)
    setYou('')
    setPhase('idle')
  }

  const q = query.trim().toLowerCase()

  const rows = useMemo(() => {
    if (!chat) return []
    const out = []
    let lastDate = null
    for (const b of chat.bubbles) {
      if (b.s !== 'system' && b.d !== lastDate) {
        out.push({ kind: 'date', date: b.d })
        lastDate = b.d
      }
      out.push({ kind: 'msg', b })
    }
    return out
  }, [chat])

  const reversed = useMemo(() => rows.slice().reverse(), [rows])

  const matches = useMemo(() => {
    if (!chat || !q) return []
    const list = []
    for (let i = 0; i < reversed.length; i++) {
      const row = reversed[i]
      if (row.kind === 'msg' && row.b.b.toLowerCase().includes(q)) list.push(i)
    }
    return list.reverse()
  }, [chat, q, reversed])

  const currentMatch = matches.length ? Math.min(searchIdx, matches.length - 1) : -1

  const nextMatch = useCallback(() => {
    if (matches.length) setSearchIdx((i) => Math.min(i + 1, matches.length - 1))
  }, [matches.length])

  const prevMatch = useCallback(() => {
    if (matches.length) setSearchIdx((i) => Math.max(i - 1, 0))
  }, [matches.length])

  useEffect(() => {
    if (!chat || currentMatch < 0) return
    const raf = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: matches[currentMatch],
        align: 'center',
        behavior: 'smooth',
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [chat, matches, currentMatch])

  const renderRow = (row, i) => (
    <div className={`msg-col${i === currentMatch ? ' hl-current' : ''}`}>
      {row.kind === 'date' ? (
        <div className="date-sep">
          <span>{fmtDate(row.date)}</span>
        </div>
      ) : (
        <Bubble b={row.b} you={you} media={chat.media} q={q} onImage={(url, name) => setLb({ url, name })} />
      )}
    </div>
  )

  const stats = useMemo(() => {
    if (!chat) return null
    const counts = {}
    for (const b of chat.bubbles) {
      if (b.s === 'system') continue
      counts[b.s] = (counts[b.s] || 0) + 1
    }
    return counts
  }, [chat])

  return (
    <div className={`app ${dark ? 'dark' : ''}`}>
      <div className="bg" />
      {phase === 'ready' && chat ? (
        <>
          <header>
            <div className="avatar-wrap">
              <div className="avatar">{(chat.participants.find((p) => p !== you) || '?').charAt(0)}</div>
              <span className="online-dot" />
            </div>
            <div className="hd-info">
              <h1>{chat.name}</h1>
              <p>
                <span className="online" />
                en línea
              </p>
            </div>
            <div className="hd-controls">
              {chat.participants.length > 1 ? (
                <select value={you} onChange={(e) => setYou(e.target.value)} title="¿Quién sos vos?" className="you-select">
                  {chat.participants.map((p) => (
                    <option key={p} value={p}>
                      👤 {p}
                    </option>
                  ))}
                </select>
              ) : null}
              <button className="icon-btn" onClick={() => setDark((d) => !d)} title="Cambiar tema">
                {dark ? '☀️' : '🌙'}
              </button>
              <button className="icon-btn" onClick={reset} title="Cargar otro chat">
                📂
              </button>
            </div>
          </header>

          <div className="stats-bar">
            <span>💬 {chat.bubbles.length} mensajes</span>
            <span>🖼️ {chat.mediaCount} archivos</span>
            {stats
              ? Object.entries(stats).map(([k, v]) => (
                  <span key={k}>👤 {k}: {v}</span>
                ))
              : null}
          </div>

          {chats.length > 1 ? (
            <div className="chat-tabs">
              {chats.map((c, i) => (
                <button
                  key={i}
                  className={i === active ? 'tab active' : 'tab'}
                  onClick={() => {
                    setActive(i)
                    setQuery('')
                    setSearchIdx(0)
                    setYou(autoYou(c))
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="search-bar">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
            </svg>
            <input
              type="search"
              placeholder="Buscar en el chat…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSearchIdx(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  nextMatch()
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  prevMatch()
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  nextMatch()
                }
              }}
            />
            {q ? (
              <div className="search-nav">
                <button
                  className="nav-btn"
                  onClick={prevMatch}
                  disabled={currentMatch <= 0}
                  aria-label="Anterior coincidencia"
                  title="Anterior (más viejo)"
                >
                  ↑
                </button>
                <span className="count">
                  {matches.length ? `${currentMatch + 1}/${matches.length}` : '0/0'}
                </span>
                <button
                  className="nav-btn"
                  onClick={nextMatch}
                  disabled={currentMatch < 0 || currentMatch >= matches.length - 1}
                  aria-label="Siguiente coincidencia"
                  title="Siguiente (más nuevo)"
                >
                  ↓
                </button>
              </div>
            ) : null}
          </div>

          {!chat.bubbles.length ? (
            <div className="no-results">
              <div className="nr-emoji">💬</div>
              Este chat no tiene mensajes.
            </div>
          ) : q && !matches.length ? (
            <div className="no-results">
              <div className="nr-emoji">🔍</div>
              Sin resultados para «{query.trim()}»
            </div>
          ) : (
            <div className="chat-rot">
              <Virtuoso
                ref={virtuosoRef}
                key={chat.name}
                components={{ Scroller: ChatScroller }}
                data={reversed}
                computeItemKey={(i) => i}
                overscan={1000}
                atTopStateChange={(atTop) => setShowFab(!atTop)}
                itemContent={(i, row) => renderRow(row, i)}
              />
            </div>
          )}

          {showFab ? (
            <button
              className="fab"
              onClick={() =>
                virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' })
              }
              aria-label="Ir al último mensaje"
              title="Ir al último mensaje"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>
          ) : null}
        </>
      ) : (
        <main className="start">
          <h1 className="logo">
            WhatsApp <span>Chat Viewer</span>
          </h1>
          <DropZone onFile={processFile} busy={phase === 'parsing'} error={error} />
        </main>
      )}

      {lb ? (
        <div className="lightbox" onClick={() => setLb(null)} role="dialog" aria-modal="true">
          <button className="lb-close" onClick={() => setLb(null)} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M18.3 5.71 12 12l-6.3-6.29L4.3 7.12 10.59 13.4l-6.29 6.3 1.41 1.41 6.3-6.29 6.3 6.29 1.41-1.41-6.29-6.3 6.29-6.28z" />
            </svg>
          </button>
          <img src={lb.url} alt={lb.name} />
          <div className="lb-caption">{lb.name}</div>
        </div>
      ) : null}
    </div>
  )
}
