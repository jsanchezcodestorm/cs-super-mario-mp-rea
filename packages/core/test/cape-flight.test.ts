import assert from 'node:assert/strict'
import test from 'node:test'
import { Buttons } from '../src/types.ts'
import { advanceCapeFlightY, startCapeFlight, stepCapeFlight } from '../src/cape-flight.ts'
import { tickAtPalFrame } from '../src/pal-time.ts'
import { initialPlayer } from '../src/state.ts'

const newPlayer = () => initialPlayer({ id: 'mario', nickname: 'Mario', character: 'mario' }, '105')

test('charged takeoff opens at the apex and steers through timed PAL flight phases', () => {
  const player = newPlayer()
  player.flight = 1
  const flight = startCapeFlight()
  player.capeFlight = flight
  player.vy = -1

  stepCapeFlight(player, flight, Buttons.right | Buttons.run, tickAtPalFrame(1))
  assert.equal(flight.phase, 0)
  assert.equal(flight.takeoffTimer, 0x4f)

  player.vy = 0
  stepCapeFlight(player, flight, Buttons.right | Buttons.run, tickAtPalFrame(2))
  assert.equal(flight.phase, 1)

  stepCapeFlight(player, flight, Buttons.right | Buttons.run, tickAtPalFrame(3))
  assert.equal(flight.phase, 2)
  assert.equal(flight.target, 1)

  for (let frame = 4; frame <= 11; frame++)
    stepCapeFlight(player, flight, Buttons.right | Buttons.run, tickAtPalFrame(frame))
  assert.equal(flight.phase, 3)

  stepCapeFlight(player, flight, Buttons.left | Buttons.run, tickAtPalFrame(12))
  assert.equal(flight.phase, 2)
  assert.equal(flight.target, 0)
})

test('Jump maintains a shallow descent and flight pitch sets the vertical speed cap', () => {
  const player = newPlayer()
  const flight = startCapeFlight()
  flight.floatTimer = 16
  const floating = advanceCapeFlightY(6, flight, false)
  flight.floatTimer = 0
  const falling = advanceCapeFlightY(6, flight, false)
  assert.ok(floating < falling)

  flight.phase = 1
  const gliding = advanceCapeFlightY(6, flight, false)
  flight.phase = 6
  const diving = advanceCapeFlightY(6, flight, false)
  assert.ok(gliding < diving)
  assert.ok(gliding > 0)
})

test('a deep dive shortens the next cape-pump interval', () => {
  const player = newPlayer()
  const flight = startCapeFlight()
  flight.phase = 2
  flight.target = 0
  player.capeFlight = flight
  player.vy = 4.2

  stepCapeFlight(player, flight, Buttons.right | Buttons.run, tickAtPalFrame(1))

  assert.equal(flight.maxStage, 0xc8)
  assert.equal(flight.phase, 3)
  assert.equal(flight.pumpTimer, 2)
})
