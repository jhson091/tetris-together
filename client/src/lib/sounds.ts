let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  vol = 0.2,
  sweepFrom?: number,
) {
  const c = getCtx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = type
  if (sweepFrom !== undefined) {
    osc.frequency.setValueAtTime(sweepFrom, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(freq, c.currentTime + duration)
  } else {
    osc.frequency.value = freq
  }
  gain.gain.setValueAtTime(vol, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + duration)
}

export function playMove() {
  tone(180, 0.04, 'square', 0.1)
}

export function playRotate() {
  tone(280, 0.05, 'square', 0.1)
}

export function playHardDrop() {
  tone(80, 0.14, 'square', 0.28, 520)
}

export function playClear(lines: number) {
  const freqs = [523, 659, 784, 1047]
  for (let i = 0; i < Math.min(lines, 4); i++) {
    setTimeout(() => tone(freqs[i], 0.18, 'sine', 0.38), i * 70)
  }
}

export function playTurnStart() {
  tone(660, 0.08, 'sine', 0.28)
  setTimeout(() => tone(880, 0.13, 'sine', 0.28), 90)
}

export function playGameOver() {
  ;[400, 320, 240, 160].forEach((freq, i) => {
    setTimeout(() => tone(freq, 0.24, 'sawtooth', 0.24), i * 180)
  })
}
