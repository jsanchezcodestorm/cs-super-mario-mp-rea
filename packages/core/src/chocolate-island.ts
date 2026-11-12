/** Chocolate Island 2 uses digit comparisons on the SNES level timer. */
export function chocolateRoom(destination: string, coins: number, dragonCoins: number, timeLeft: number) {
  if (destination === '0cd') return dragonCoins === 4 ? destination : 'ci2-1'
  if (destination === '0cf') {
    if (coins <= 8) return 'ci2-5'
    if (coins <= 20) return 'ci2-4'
  }
  const tens = Math.floor(timeLeft / 10) % 10
  if (destination === '0ce' && timeLeft >= 200 && (tens > 3 || (tens === 3 && timeLeft % 10 >= 5)))
    return tens >= 5 ? 'ci2-8' : 'ci2-7'
  return destination
}
