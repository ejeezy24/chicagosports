import assert from 'node:assert/strict'
import test from 'node:test'
import { copyText } from '../src/share.js'

function fakeDocument(copyResult) {
  const state = { value: '', removed: false }
  const textarea = {
    style: {}, value: '',
    focus() {}, select() {},
    remove() { state.removed = true },
  }
  return {
    state,
    createElement(name) {
      assert.equal(name, 'textarea')
      return textarea
    },
    body: { append(node) { state.value = node.value } },
    execCommand(command) {
      assert.equal(command, 'copy')
      state.value = textarea.value
      return copyResult
    },
  }
}

test('copyText falls back to a temporary textarea', async () => {
  const document = fakeDocument(true)
  const result = await copyText('https://example.com/game', {
    navigator: { clipboard: { writeText: async () => { throw new Error('denied') } } },
    document,
    prompt: () => { throw new Error('prompt should not run') },
  })
  assert.equal(result, 'copied')
  assert.equal(document.state.value, 'https://example.com/game')
  assert.equal(document.state.removed, true)
})

test('copyText offers a manual prompt when clipboard methods fail', async () => {
  const document = fakeDocument(false)
  let prompted = null
  const result = await copyText('https://example.com/game', {
    navigator: {}, document,
    prompt: (message, value) => { prompted = [message, value]; return value },
  })
  assert.equal(result, 'manual')
  assert.deepEqual(prompted, ['Copy this game link', 'https://example.com/game'])
})

test('copyText stops stale copy attempts before opening a fallback', async () => {
  let rejectClipboard
  let current = true
  let fallbackCalls = 0
  const pending = copyText('https://example.com/game', {
    navigator: { clipboard: { writeText: () => new Promise((resolve, reject) => { rejectClipboard = reject }) } },
    document: { createElement() { fallbackCalls += 1 }, body: {}, execCommand() { fallbackCalls += 1 } },
    prompt: () => { fallbackCalls += 1 },
  }, () => current)
  current = false
  rejectClipboard(new Error('late failure'))
  assert.equal(await pending, null)
  assert.equal(fallbackCalls, 0)
})
