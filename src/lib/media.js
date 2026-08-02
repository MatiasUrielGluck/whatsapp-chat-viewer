const ATTACH_RE =
  /^\u200e?(.+?)\s*(?:\((?:archivo adjunto|adjunto|file attached)\)|\[(?:archivo adjunto|adjunto|file attached)\])\s*$/i

export function isAttachment(line) {
  const m = ATTACH_RE.exec(line)
  return m ? m[1] : null
}

export function extOf(name) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

export function kindOf(name) {
  const ext = extOf(name)
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return 'image'
  if (ext === 'webp') return 'sticker'
  if (['mp4', 'mov', '3gp', 'm4v'].includes(ext)) return 'video'
  if (['opus', 'ogg', 'oga', 'm4a', 'aac', 'mp3', 'wav', 'amr'].includes(ext)) return 'audio'
  return 'other'
}

export function mimeFor(ext, kind) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    opus: 'audio/ogg',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    amr: 'audio/amr',
  }
  return map[ext] || (kind === 'image' ? 'image/jpeg' : 'application/octet-stream')
}

export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function linkify(escaped) {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>',
  )
}
