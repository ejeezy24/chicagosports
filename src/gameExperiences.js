export function replayFrames(model) {
  const plays = model?.plays ?? []
  return plays.map((play, index) => ({ ...play, index, isFinal: index === plays.length - 1 }))
}

export function winnerFor(model, team) {
  return model?.teams?.find((side) => side.isUs)?.winner === true ? team?.short : model?.teams?.find((side) => side.winner)?.name ?? null
}

export function hasReplayData(model) {
  return Boolean(model?.plays?.length)
}
