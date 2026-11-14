/** Convert the shared 60 Hz simulation clock to European cartridge frames. */
export function palFrame(tick: number) { return Math.floor(tick * 5 / 6) }

/** Whether the shared 60 Hz clock advanced to a new European cartridge frame. */
export function advancesPalFrame(tick: number) { return palFrame(tick) !== palFrame(tick - 1) }

/** First simulation tick that samples the requested cartridge frame. */
export function tickAtPalFrame(frame: number) { return Math.ceil(frame * 6 / 5) }

/** E1 starts both P-switch timers at $B0 and decrements them every fourth PAL frame. */
export function switchDurationTicks(tick: number) {
  const expiryFrame = (Math.floor(palFrame(tick) / 4) + 0xb0) * 4
  return tickAtPalFrame(expiryFrame) - tick
}
