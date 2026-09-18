import { TEAMS } from './teams.js'
import { VENUES } from './venues.js'

// Questions use the same team and venue catalog as the rest of the site.
export const QUESTIONS = [
  ...TEAMS.map((t) => ({ id: `home-${t.key}`, prompt: `Where do the ${t.short} play their home games?`, answer: t.venue, choices: VENUES.map((v) => v.name), explanation: `${t.name} call ${t.venue} home.` })),
  ...TEAMS.map((t) => ({ id: `league-${t.key}`, prompt: `Which league do the ${t.short} compete in?`, answer: t.leagueLabel, choices: ['MLB', 'NFL', 'NBA', 'NHL'], explanation: `${t.name} play in the ${t.leagueLabel}.` })),
  ...VENUES.map((v) => ({ id: `opened-${v.key}`, prompt: `In what year did ${v.name} open?`, answer: String(v.opened), choices: VENUES.map((venue) => String(venue.opened)), explanation: `${v.name} opened in ${v.opened}.` })),
  ...VENUES.map((v) => ({ id: `area-${v.key}`, prompt: `Which neighborhood is home to ${v.name}?`, answer: v.neighbourhood, choices: VENUES.map((venue) => venue.neighbourhood), explanation: `${v.name} is in ${v.neighbourhood}.` })),
  { id: 'shared-arena', prompt: 'Which pair of teams shares the United Center?', answer: 'Bulls + Blackhawks', choices: ['Bulls + Blackhawks', 'Cubs + White Sox', 'Bears + Bulls', 'Bears + Blackhawks'], explanation: 'The Bulls and Blackhawks share the United Center, switching between hardwood and ice.' },
  { id: 'crosstown', prompt: 'Which two teams meet in the Crosstown series?', answer: 'Cubs + White Sox', choices: ['Cubs + White Sox', 'Bears + Bulls', 'Bulls + Blackhawks', 'Cubs + Bears'], explanation: 'The Crosstown series brings together Chicago’s two MLB clubs: the Cubs and White Sox.' },
]

export function dailyQuestion(day) {
  const ordinal = Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 86_400_000)
  const question = QUESTIONS[((ordinal % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length]
  const offset = ordinal % question.choices.length
  const choices = [...question.choices.slice(offset), ...question.choices.slice(0, offset)]
  return { ...question, choices, correctIndex: choices.indexOf(question.answer) }
}
