import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { IMAGERY_CREDIT, venueByName } from '../venues.js'
import wrigleyAerial from '../assets/venues/wrigley.jpg'
import rateAerial from '../assets/venues/rate.jpg'
import soldierAerial from '../assets/venues/soldier.jpg'
import unitedAerial from '../assets/venues/united.jpg'

/**
 * Hover (or focus) a venue name and the ground it stands on turns underneath it,
 * alongside a note on when it opened and what happened there.
 *
 * The view is a USGS aerial, straight down. That matters for more than fidelity:
 * spinning a flat photo normally reads as a spinning postcard, but from directly
 * overhead a rotation is a real one, so the picture turns the way the ground
 * would. The image is oversized to 1.42x the frame — a square has to be at least
 * its own diagonal to cover a square window at every angle — which is also why
 * each aerial is framed wide enough to keep the building in the middle 70%.
 */

// Keyed by venue, so a missing image is a build error rather than a broken
// <img> at runtime.
const AERIALS = {
  wrigley: wrigleyAerial,
  rate: rateAerial,
  soldier: soldierAerial,
  united: unitedAerial,
}

function Popover({ venue, id, anchor }) {
  const ref = useRef(null)

  // Fixed positioning, placed by hand: schedule rows clip their overflow, so an
  // absolutely-positioned card would be cut off by its own row.
  useLayoutEffect(() => {
    const el = ref.current
    const trigger = anchor.current
    if (!el || !trigger) return

    const t = trigger.getBoundingClientRect()
    const { width, height } = el.getBoundingClientRect()
    const margin = 10

    const left = Math.min(Math.max(margin, t.left), window.innerWidth - width - margin)
    const below = t.bottom + 8
    const top =
      below + height + margin <= window.innerHeight
        ? below
        : Math.max(margin, t.top - height - 8)

    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    el.style.visibility = 'visible'
  }, [anchor])

  return (
    <div className="venue-pop" id={id} role="tooltip" ref={ref}>
      <div className="v-stage">
        <div className="v-window">
          <img
            className="v-aerial"
            src={AERIALS[venue.key]}
            alt={`${venue.name} from directly overhead`}
          />
        </div>
      </div>

      <div className="v-info">
        <h4>{venue.name}</h4>
        <div className="v-meta">
          Opened {venue.opened} · {venue.capacity} · {venue.neighbourhood}
        </div>
        <p className="v-blurb">{venue.blurb}</p>
        <ul>
          {venue.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="v-credit">{IMAGERY_CREDIT}</div>
      </div>
    </div>
  )
}

/**
 * Wraps a venue name. Unknown venues (every away ground) render as plain text,
 * so this can be dropped on any venue string without checking first.
 */
export function Venue({ name, children }) {
  const venue = venueByName(name)
  // Pointer and keyboard are tracked apart so moving the mouse away doesn't
  // yank the card out from under someone who tabbed to it.
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = hovered || focused
  const id = useId()
  const ref = useRef(null)

  const close = useCallback(() => {
    setHovered(false)
    setFocused(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close()
        ref.current?.blur()
      }
    }
    // The card is positioned once, against the trigger's place on screen, so
    // scrolling out from under it should dismiss rather than leave it stranded.
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  const label = children ?? name
  if (!venue) return label

  return (
    <>
      <button
        type="button"
        ref={ref}
        className={`venue-tag${open ? ' is-open' : ''}`}
        aria-label={`${venue.name} — stadium details`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {label}
      </button>
      {open ? <Popover venue={venue} id={id} anchor={ref} /> : null}
    </>
  )
}
