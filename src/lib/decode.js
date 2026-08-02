export function decodeBytes(bytes) {
  if (!bytes || !bytes.length) return ''
  const len = bytes.length
  if (len >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2))
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2))
    }
  }
  if (len >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  let nulls = 0
  for (let i = 0; i < len; i += 2) {
    if (bytes[i + 1] === 0) nulls++
  }
  if (len > 8 && nulls > len / 4) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  return new TextDecoder('utf-8').decode(bytes)
}
