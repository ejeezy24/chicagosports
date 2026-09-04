export async function copyText(text, environment = {}, isCurrent = () => true) {
  const navigatorApi = environment.navigator ?? globalThis.navigator
  const documentApi = environment.document ?? globalThis.document
  const promptApi = environment.prompt ?? globalThis.prompt

  if (!isCurrent()) return null
  try {
    if (typeof navigatorApi?.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
    await navigatorApi.clipboard.writeText(text)
    return isCurrent() ? 'copied' : null
  } catch {
    // Continue to a browser-compatible fallback.
  }

  if (!isCurrent()) return null
  let textarea = null
  try {
    if (!documentApi?.body || typeof documentApi.createElement !== 'function') throw new Error('Document unavailable')
    textarea = documentApi.createElement('textarea')
    textarea.value = text
    textarea.setAttribute?.('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    documentApi.body.append(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    if (documentApi.execCommand?.('copy') === true) return isCurrent() ? 'copied' : null
  } catch {
    // The final fallback gives the user a selectable link.
  } finally {
    textarea?.remove()
  }

  if (!isCurrent()) return null
  if (typeof promptApi === 'function') {
    try {
      promptApi('Copy this game link', text)
      return isCurrent() ? 'manual' : null
    } catch {
      // Some embedded browsers disable prompts.
    }
  }
  return isCurrent() ? 'failed' : null
}
