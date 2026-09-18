export function posterLines(context, text, width, maxLines = 4) {
  const lines = []
  let line = ''
  for (const character of Array.from(String(text).replace(/\s+/g, ' ').trim())) {
    const next = line + character
    if (context.measureText(next).width > width && line) { lines.push(line.trim()); line = character.trimStart() }
    else line = next
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…' }
  return lines
}
export function drawPoster(canvas, team, game, caption, showScores) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw a poster.')
  canvas.width = 1080; canvas.height = 1350
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350)
  gradient.addColorStop(0, team.color); gradient.addColorStop(1, '#101b2d')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350)
  ctx.fillStyle = team.accent; ctx.beginPath(); ctx.moveTo(850, 0); ctx.lineTo(1080, 0); ctx.lineTo(1080, 580); ctx.lineTo(610, 1350); ctx.lineTo(350, 1350); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#101b2dcc'; ctx.fillRect(48, 190, 984, 945)
  ctx.fillStyle = '#fff'; ctx.font = '700 26px sans-serif'; ctx.fillText('CHICAGO SPORTS / GAME POSTER', 70, 105)
  ctx.font = '800 72px sans-serif'
  posterLines(ctx, team.name.toUpperCase(), 920, 2).forEach((line, i) => ctx.fillText(line, 80, 290 + i * 82))
  ctx.font = '500 30px sans-serif'; ctx.fillText(game.home ? 'VS' : 'AT', 80, 475)
  ctx.font = '800 62px sans-serif'
  posterLines(ctx, String(game.opponent?.name ?? 'Opponent').toUpperCase(), 920, 2).forEach((line, i) => ctx.fillText(line, 80, 555 + i * 72))
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  const result = showScores && (game.completed || game.state === 'in') && known(game.ourScore) && known(game.theirScore)
  ctx.font = '800 140px sans-serif'; ctx.fillText(result ? `${game.ourScore} – ${game.theirScore}` : 'GAME DAY', 80, 835, 910)
  ctx.font = '700 25px sans-serif'; ctx.fillText(result ? game.completed ? 'FINAL' : 'LIVE SNAPSHOT' : game.completed || game.state === 'in' ? 'SCORE HIDDEN' : 'UPCOMING', 82, 887)
  const date = new Date(game.date)
  const dateText = Number.isNaN(+date) ? 'Date to be announced' : new Intl.DateTimeFormat('en-US', { dateStyle:'long', timeZone:'America/Chicago' }).format(date)
  ctx.font = '500 27px sans-serif'; ctx.fillText(dateText + ' · Chicago time', 80, 962)
  if (game.venue) { ctx.font = '500 24px sans-serif'; ctx.fillText(String(game.venue), 80, 1003, 915) }
  ctx.font = '600 32px sans-serif'
  posterLines(ctx, caption, 920, 3).forEach((line, i) => ctx.fillText(line, 80, 1165 + i * 39))
  ctx.font = '500 20px sans-serif'; ctx.fillText('chicagosports.vercel.app  ·  Fan-made / unofficial', 80, 1320)
}
export function posterBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The poster could not be exported.')), 'image/png'))
}
export function downloadPoster(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = name
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
