import { useEffect, useRef } from 'react'

function cancelAll(state) {
  state.active.forEach(animation => animation.cancel())
  state.active.clear()
  state.byElement = new WeakMap()
}

function animate(state, element, frames, id) {
  if (!element?.isConnected || typeof element.animate !== 'function' || state.media?.matches) return
  state.byElement.get(element)?.cancel()
  const animation = element.animate(frames, {
    duration: id === 'cs-panel' ? 280 : 240,
    easing: 'cubic-bezier(.2,.8,.2,1)',
    fill: 'none',
  })
  animation.id = id
  state.byElement.set(element, animation)
  state.active.add(animation)
  const cleanup = () => {
    state.active.delete(animation)
    if (state.byElement.get(element) === animation) state.byElement.delete(element)
  }
  animation.finished.then(cleanup, cleanup)
}

export function useInteractionMotion(panelRef, navigationKey) {
  const motion = useRef({ active: new Set(), byElement: new WeakMap(), media: null })
  const previousKey = useRef(navigationKey)

  useEffect(() => {
    const state = motion.current
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    state.media = media
    const onChange = () => { if (media?.matches) cancelAll(state) }
    const onClick = event => {
      const target = event.target.closest?.('button, summary')
      if (!target?.closest('.app') || target.disabled || target.getAttribute('aria-disabled') === 'true') return
      animate(state, target, [
        { scale: '1' },
        { scale: '.96', offset: .35 },
        { scale: '1.015', offset: .72 },
        { scale: '1' },
      ], 'cs-press')
    }
    document.addEventListener('click', onClick)
    media?.addEventListener?.('change', onChange)
    return () => {
      document.removeEventListener('click', onClick)
      media?.removeEventListener?.('change', onChange)
      cancelAll(state)
    }
  }, [])

  useEffect(() => {
    // Only navigation changes replay this effect. Polls and form input keep
    // their state, and Strict Mode's initial effect replay stays motionless.
    if (previousKey.current === navigationKey) return
    previousKey.current = navigationKey
    const state = motion.current
    const panel = panelRef.current
    animate(state, panel, [
      { translate: '0 12px', opacity: .55 },
      { translate: 'none', opacity: 1 },
    ], 'cs-panel')
    return () => { state.byElement.get(panel)?.cancel() }
  }, [navigationKey, panelRef])
}
