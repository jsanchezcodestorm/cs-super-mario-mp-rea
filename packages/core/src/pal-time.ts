/** Convert the shared 60 Hz simulation clock to European cartridge frames. */
export function palFrame(tick: number) { return Math.floor(tick * 5 / 6) }
