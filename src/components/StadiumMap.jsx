import { useState } from 'react'
import { VENUES, IMAGERY_CREDIT } from '../venues.js'
import { TEAMS } from '../teams.js'
import { Panel } from './ui.jsx'
import wrigley from '../assets/venues/wrigley.jpg'
import rate from '../assets/venues/rate.jpg'
import soldier from '../assets/venues/soldier.jpg'
import united from '../assets/venues/united.jpg'
import '../city-experiences.css'

const PLACES = {
  wrigley: { x:235, y:80, image:wrigley, address:'1060 W. Addison Street', source:'https://www.mlb.com/cubs/ballpark' },
  united: { x:125, y:315, image:united, address:'1901 W. Madison Street', source:'https://www.unitedcenter.com/plan-your-visit/' },
  soldier: { x:325, y:405, image:soldier, address:'1410 Special Olympics Drive', source:'https://www.soldierfield.com/stadium-info/contact-us' },
  rate: { x:255, y:520, image:rate, address:'333 W. 35th Street', source:'https://www.mlb.com/whitesox/ballpark' },
}
export function StadiumMap({ team }) {
  const [key, setKey] = useState(() => VENUES.find(venue => venue.teams.includes(team.key))?.key ?? 'wrigley')
  const venue = VENUES.find(place => place.key === key)
  const place = PLACES[key]
  return <Panel title="Chicago Stadium Explorer" aside="Four grounds. Five clubs." note="Select a stadium on the map or from the list. This city overview is schematic; open directions for street navigation.">
    <div className="stadium-explorer">
      <div className="stadium-map"><svg viewBox="0 0 520 620" aria-label="Chicago stadium map" role="group">
        <rect width="520" height="620" fill="#e7e9dc" /><path d="M345 0 Q330 150 370 240 L400 350 L385 470 L410 620 H520 V0Z" fill="#9dc7d5" />
        <path d="M80 620 L290 340 L345 295 M290 340 L260 130" fill="none" stroke="#9dc7d5" strokeWidth="13" />
        <path d="M30 315 H368 M50 520 H388 M60 80 H337" stroke="#ffffff" strokeWidth="9" />
        <text x="414" y="190" fill="#285367" fontSize="17" transform="rotate(90 414 190)">LAKE MICHIGAN</text>
        <text x="305" y="335" fill="#536072" fontSize="13">THE LOOP</text><text x="25" y="32" fill="#192437" fontSize="16">↑ N</text>
        {VENUES.map(item => { const point = PLACES[item.key]; return <g key={item.key} role="button" tabIndex="0" aria-label={item.name} aria-pressed={key === item.key} onClick={() => setKey(item.key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setKey(item.key) } }} className="stadium-marker">
          <circle cx={point.x} cy={point.y} r={key === item.key ? 22 : 17} fill={TEAMS.find(t => t.key === item.teams[0]).color} stroke="#fff" strokeWidth="4" />
          <circle cx={point.x} cy={point.y} r="5" fill="#fff" /><text x={point.x} y={point.y + 40} textAnchor="middle" fill="#192437" fontWeight="700" fontSize="15">{item.name}</text>
        </g> })}
      </svg><div className="stadium-buttons">{VENUES.map(item => <button key={item.key} className="pixel-button" aria-pressed={key === item.key} onClick={() => setKey(item.key)}>{item.name}</button>)}</div></div>
      <article className="stadium-detail" key={key}><img src={place.image} alt={`Aerial view of ${venue.name}`} /><small>{IMAGERY_CREDIT}</small><div><span className="news-kicker">{venue.neighbourhood}</span><h3>{venue.name}</h3><p>{venue.teams.map(id => TEAMS.find(t => t.key === id).name).join(' · ')}</p><p>Opened {venue.opened} · {venue.capacity}</p><ul>{venue.facts.map(fact => <li key={fact}>{fact}</li>)}</ul><p>{place.address}, Chicago</p><div className="stadium-links"><a href={place.source} target="_blank" rel="noreferrer">Official venue information ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + place.address + ' Chicago')}`} target="_blank" rel="noreferrer">Directions ↗</a></div></div></article>
    </div>
  </Panel>
}
