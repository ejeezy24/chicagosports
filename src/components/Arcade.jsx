import { useFan, useChicagoDay } from '../FanContext.jsx'
import { challengeStats } from '../fan.js'
import { dailyQuestion } from '../arcade.js'
import { Panel } from './ui.jsx'

export function Arcade() {
  const fan = useFan()
  const today = useChicagoDay()
  const question = dailyQuestion(today)
  const answer = fan.answers[today]
  const stats = challengeStats(fan.answers, today)
  const badges = [
    { icon: '★', label: 'First win', earned: stats.wins >= 1, detail: 'Answer one challenge correctly' },
    { icon: 'III', label: 'On a roll', earned: stats.best >= 3, detail: 'Win on three consecutive days' },
    { icon: 'VII', label: 'Chicago expert', earned: stats.best >= 7, detail: 'Win on seven consecutive days' },
  ]
  return <Panel title="Daily arcade" aside={today}>
    <div className="feature-intro"><span className="eyebrow">Player one · Chicago edition</span><h2>One city. One daily challenge.</h2><p>One attempt each day. A new question arrives at midnight in Chicago. Come back tomorrow to keep your winning streak going.</p></div>
    <div className="summary"><div><span>Current streak</span><strong>{stats.current}</strong></div><div><span>Best streak</span><strong>{stats.best}</strong></div><div><span>Correct</span><strong>{stats.wins}/{stats.played}</strong></div></div>
    <div className="challenge"><span className="eyebrow">Today’s question</span><h3>{question.prompt}</h3><div className="answer-grid">{question.choices.map((choice, i) => <button className={`answer-button${answer && i === question.correctIndex ? ' correct' : ''}${answer && i === answer.choice && !answer.correct ? ' incorrect' : ''}`} key={choice} disabled={Boolean(answer)} onClick={() => fan.answer(today, i, i === question.correctIndex)}><span>{String.fromCharCode(65 + i)}</span>{choice}{answer && i === question.correctIndex ? ' ✓' : ''}{answer && i === answer.choice && !answer.correct ? ' ×' : ''}</button>)}</div>
      {answer ? <div className={`challenge-result ${answer.correct ? 'correct' : ''}`} role="status"><strong>{answer.correct ? 'Correct! Nicely played.' : 'Not this time. Try again tomorrow.'}</strong><p>{question.explanation}</p><small>Your answer is saved for today.</small></div> : <p className="micro-note">Choose carefully—your first answer counts.</p>}
    </div>
    <div className="badge-shelf">{badges.map((badge) => <div className={`achievement${badge.earned ? ' earned' : ''}`} key={badge.label}><span className="achievement-icon" aria-hidden="true">{badge.icon}</span><strong>{badge.label}</strong><span>{badge.earned ? 'Unlocked' : 'Locked'} · {badge.detail}</span></div>)}</div>
    <p className="micro-note">Progress is saved on this device. Questions come from the site’s team and stadium guide.</p>
  </Panel>
}
