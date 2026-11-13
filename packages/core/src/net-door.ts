import { palFrame } from './pal-time.ts'
import { Buttons, type GameState, type LevelDefinition, type NetDoor, type PlayerState } from './types.ts'

export function netDoorPhase(door: NetDoor, tick: number) {
  return palFrame(tick) - palFrame(door.tick) - 12
}

function doorInReach(p: PlayerState, room: LevelDefinition) {
  // Sprite clipping #03 is 8x8 at (+20,+8) after INIT adds (+8,+7).
  // Its player test uses a 16x16 rectangle at the native player origin.
  const x = Math.floor(p.x) - 2, y = Math.floor(p.y + p.height) - 32
  return room.sprites.find(s => s.spriteId === 0x54 &&
    x + 16 >= s.x + 28 && x <= s.x + 36 && y + 16 >= s.y + 15 && y <= s.y + 23)
}

function latchDoor(state: GameState, p: PlayerState, room: LevelDefinition) {
  const door = doorInReach(p, room)
  if (!door || p.netPunchTick === undefined) return
  const doors = state.netDoors ??= []
  const turning = doors.find(d => d.roomId === room.id && d.x === door.x && d.y === door.y)
  if (turning) {
    if (turning.tick === p.netPunchTick && !turning.players.includes(p.id)) turning.players.push(p.id)
  } else doors.push({ roomId: room.id, x: door.x, y: door.y, tick: p.netPunchTick, players: [p.id] })
}

// $00:DAB3 / $00:DAC5 in E1. The door accelerates its rider horizontally
// in 8.8 speed units, moving by the signed high byte in sixteenths of a pixel.
const initialSpeed = [16,15,14,13,12,11,10,9,8,7,6,5,5,5,5,5,5,5]
const acceleration = [0x120,0x140,0x12a,0x12a,0x130,0x133,0x132,0x134,0x136,
  0x138,0x13a,0x13b,0x145,0x145,0x145,0x145,0x145,0x108]

function riderX(turn: NonNullable<PlayerState['netTurn']>, phase: number) {
  const index = Math.abs(turn.offsetX), sign = turn.offsetX < 0 ? -1 : 1
  let speed = sign * initialSpeed[index] * 256, distance = 0
  for (let age = 1; age < phase; age++) {
    speed += (age <= 23 ? -sign : sign) * acceleration[index]
    distance += Math.floor(speed / 256)
  }
  return turn.x + 26 + turn.offsetX + Math.floor(distance / 16)
}

export function advanceNetDoors(state: GameState) {
  if (!state.netDoors) return
  for (const door of state.netDoors) {
    const phase = netDoorPhase(door, state.tick)
    if (phase < 0) continue
    for (const id of door.players) {
      const p = state.players[id]
      if (p.roomId !== door.roomId || p.status !== 'alive') continue
      if (phase === 0 && !p.netTurn && p.netClinging) {
        const offsetX = Math.floor(p.x) - door.x - 26
        if (Math.abs(offsetX) < initialSpeed.length)
          p.netTurn = { x: door.x, y: door.y, roomId: door.roomId, tick: state.tick,
            offsetX, fromBehind: !!p.behindNet }
      }
      const turn = p.netTurn
      if (!turn || turn.x !== door.x || turn.y !== door.y || turn.roomId !== door.roomId) continue
      p.x = riderX(turn, Math.min(31, phase))
      if (phase >= 15) p.behindNet = !turn.fromBehind
      if (phase >= 31) delete p.netTurn
    }
  }
  state.netDoors = state.netDoors.filter(door => netDoorPhase(door, state.tick) < 31)
  if (!state.netDoors.length) delete state.netDoors
}

export function stepNetPunch(state: GameState, room: LevelDefinition, p: PlayerState, pressed: number) {
  if (p.netTurn) return true
  if (p.netPunchTick !== undefined) {
    const age = palFrame(state.tick) - palFrame(p.netPunchTick)
    if (age === 7) latchDoor(state, p, room)
    if (age < 8) return true
    delete p.netPunchTick
  }
  // B takes precedence over a simultaneous punch in the climbing handler.
  if (!(pressed & Buttons.run) || pressed & Buttons.jump) return false
  p.netPunchTick = state.tick
  return true
}
