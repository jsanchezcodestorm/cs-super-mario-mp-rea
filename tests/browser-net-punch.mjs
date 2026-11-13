import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { cameraFor } from '../apps/web/src/game/terrain-view.ts'
import { createGateway } from '../apps/server/src/gateway.ts'
import { startCourse } from '../packages/core/src/campaign.ts'
import { enterRoom, spawnEntity } from '../packages/core/src/state.ts'

const read = async path => JSON.parse(await readFile(path, 'utf8'))
const campaign = await read('generated/content.json')
campaign.overworldNodes = await read('generated/world/nodes.json')
campaign.movieTicks = await read('generated/movies/durations.json')
const gateway = createGateway(campaign, resolve('apps/web/dist'), resolve('generated'))
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })

async function until(description, check) {
  const deadline = Date.now() + 6000
  while (!check()) {
    if (Date.now() > deadline) throw Error(typeof description === 'function' ? description() : description)
    await delay(10)
  }
}

async function grab(page, p) {
  await page.keyboard.down('ArrowUp')
  try { await until(() => p.id + ' failed to grab the fence: ' + JSON.stringify([p.roomId, p.x, p.y, p.lastInput, p.status]), () => p.netClinging) }
  finally { await page.keyboard.up('ArrowUp') }
  await until('release Up', () => p.lastInput === 0)
}

async function inputPulse(page, p) {
  await page.keyboard.down('KeyX')
  try { await until(p.id + ' failed to start the punch', () => p.netPunchTick !== undefined) }
  finally { await page.keyboard.up('KeyX') }
}

// Read the actual 256×224 Phaser canvas while both clients are paused on the same tick.
async function sampleTarget(page, stage, focus, target, path, nativeFrame) {
  const camera = cameraFor(stage, focus.x + focus.width / 2, focus.y + focus.height / 2)
  const x = Math.round(target.x - camera.x), y = Math.round(target.y - camera.y)
  const result = await page.locator('#screen canvas').evaluate(async (canvas, { x, y, save, nativeFrame }) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    let expected
    if (nativeFrame) {
      const atlas = new Image()
      atlas.src = '/assets/creatures.png'
      await atlas.decode()
      const ctx = new OffscreenCanvas(16, 32).getContext('2d')
      ctx.drawImage(atlas, nativeFrame.x, nativeFrame.y, 16, 32, 0, 0, 16, 32)
      expected = [...ctx.getImageData(0, 0, 16, 32).data]
    }
    return {
      pixels: [...canvas.getContext('2d').getImageData(x, y, 16, 32).data],
      expected,
      image: save ? canvas.toDataURL('image/png').split(',')[1] : undefined,
    }
  }, { x, y, save: !!path, nativeFrame })
  if (path) await writeFile(path, Buffer.from(result.image, 'base64'))
  return result
}

try {
  gateway.server.listen(0, '127.0.0.1')
  await once(gateway.server, 'listening')
  const ids = ['mario', 'luigi']
  const clients = {}
  const errors = []
  let targetId
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 880, height: 700 } })
    const frames = new Map()
    page.on('pageerror', error => errors.push(error.message))
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(payload)
      if (message.type !== 'snapshot') return
      if (message.state.phase === 'playing' && message.state.players[id].roomId === '101') clients[id].castleReady = true
      if (!targetId) return
      const { tick, entities, players } = message.state
      const target = entities.find(e => e.id === targetId)
      if (target) frames.set(tick, { x: target.x, y: target.y, scores: ids.map(i => players[i].score) })
    }))
    await page.goto('http://127.0.0.1:' + gateway.server.address().port)
    clients[id] = { page, frames, castleReady: false }
  }
  const mario = clients.mario.page, luigi = clients.luigi.page
  await mario.locator('#submit').click()
  const code = await mario.locator('#invite').innerText()
  await luigi.locator('#join-tab').click()
  await luigi.locator('#room-code').fill(code)
  await luigi.locator('#submit').click()
  await Promise.all(ids.map(id => clients[id].page.locator('#ready').click()))
  await Promise.all(ids.map(id => clients[id].page.locator('#screen canvas').waitFor()))
  const room = gateway.lobby.rooms.get(code)
  const state = room.state, world = { campaign, state }
  state.progress.unlocked.push('101')
  startCourse(world, '101')
  state.entrance = null
  const door = campaign.levels['101'].sprites.find(s => s.spriteId === 0x54)
  const atlas = await read('generated/creatures.json')
  const out = 'test-results/net-punch'
  await mkdir(out, { recursive: true })
  await Promise.all(ids.map(id => clients[id].page.locator('#screen canvas').click()))
  for (const id of ids) enterRoom(world, state.players[id], '101')
  await until('castle reaches both clients', () => Object.values(clients).every(client => client.castleReady))
  await delay(600)

  for (const id of ids) for (const fromBack of [false, true]) {
    const other = ids.find(seat => seat !== id)
    const { page } = clients[id], p = state.players[id], peer = state.players[other]
    targetId = undefined
    state.entities = []
    for (const i of ids) clients[i].frames.clear()
    // Start at an isolated encounter on the actual fence in Iggy's Castle.
    const x = fromBack ? door.x + 20 : 340
    const y = fromBack ? door.y + 26 : 284
    enterRoom(world, peer, '101', { x: x - 50, y })
    enterRoom(world, p, '101', { x, y })
    await Promise.all([grab(page, p), grab(clients[other].page, peer)])
    if (fromBack) {
      await inputPulse(page, p)
      await until('rotate through door', () => p.behindNet && !p.netTurn)
      await page.keyboard.down('ArrowLeft')
      try { await until('move away from door', () => p.x < door.x - 3) }
      finally { await page.keyboard.up('ArrowLeft') }
      await until('release Left', () => p.lastInput === 0)
    }
    assert.equal(!!p.behindNet, fromBack)
    assert.equal(!!peer.behindNet, false)
    const origin = { x: Math.floor(p.x / 32) * 32 + (fromBack ? 16 : 0), y: p.y - 12 }
    const spriteId = (id === 'mario' ? 0x22 : 0x24) + Number(fromBack)
    const target = spawnEntity(world, '101', { ...origin, spriteId })
    target.x = p.x + (fromBack ? -5 : 5)
    targetId = target.id
    const before = p.score, peerBefore = peer.score, initialY = target.y
    await inputPulse(page, p)
    await until('the punch must award points to ' + id, () => p.score > before)
    const reward = p.score - before
    assert.equal(reward, 100)
    assert.ok(p.netClinging && p.status === 'alive')
    assert.equal(peer.score, peerBefore)
    await until('the knocked Koopa must stay visible and fall below its starting height',
      () => target.y > initialY + 4 && state.entities.includes(target))
    await until('both clients must receive the same rise and fall', () => {
      const a = clients.mario.frames, b = clients.luigi.frames
      const shared = [...a].filter(([tick, sample]) => b.has(tick) && sample.scores[ids.indexOf(id)] === before + reward)
      return shared.some(([, f]) => f.y < initialY - 2) && shared.some(([, f]) => f.y > initialY + 3)
    })
    for (const [tick, sample] of clients.mario.frames) {
      const received = clients.luigi.frames.get(tick)
      if (received) assert.deepEqual(received, sample)
    }
    room.status = 'paused'
    room.notify()
    room.snapshots()
    const stage = campaign.levels['101'], result = {}
    const pose = 20 + (fromBack ? 0 : 2) + Number(target.vx > 0)
    const nativeFrame = atlas.frames[stage.spriteTileset + ':net' + spriteId + '/' + pose].frame
    for (const seat of ids) {
      const path = seat === id ? out + '/' + id + (fromBack ? '-back' : '-front') + '.png' : undefined
      result[seat] = await sampleTarget(clients[seat].page, stage, state.players[seat], target, path, nativeFrame)
    }
    // Remove only this sprite from the frozen diagnostic frame. Its pixels
    // must have been visible on the native playfield in each client's view.
    state.entities = state.entities.filter(e => e !== target)
    room.snapshots()
    for (const seat of ids) {
      const without = await sampleTarget(clients[seat].page, stage, state.players[seat], target)
      const { pixels, expected } = result[seat]
      let changed = 0, matched = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === without.pixels[i] && pixels[i+1] === without.pixels[i+1] && pixels[i+2] === without.pixels[i+2]) continue
        changed++
        if (expected[i+3] && pixels[i] === expected[i] && pixels[i+1] === expected[i+1] && pixels[i+2] === expected[i+2]) matched++
      }
      assert.ok(changed > 20, seat + ' did not draw the falling turtle')
      assert.equal(matched, changed, seat + ' must show exactly the visible pixels of the ROM falling pose')
    }
    room.status = 'playing'
    room.notify()
    console.log(id, fromBack ? 'back → front' : 'front → back', 'sprite', spriteId.toString(16), 'award', reward)
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  await gateway.stop()
}
