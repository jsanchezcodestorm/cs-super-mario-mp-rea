import assert from 'node:assert/strict';
import { Buttons, type World, type PlayerId, type EntityState, type LevelDefinition, type PlayerState } from '@smw/core';
import { enterRoom } from '../../packages/core/src/state.ts';
import { blockReward } from '../../packages/core/src/block-rewards.ts';
import { isPipeBoss } from '../../packages/core/src/pipe-boss.ts';
import { findTrigger, type Objective } from './objectives.ts';

export type Drive = (mario: number, luigi: number, frames?: number) => Promise<void>;

// These fixtures place an actor at a specific ROM contact to isolate the exit
// mechanic from traversal. All items, hits, exits, unlocks and saves are produced
// by the running simulation. Entrance-to-exit input replays are tested separately.
export async function exerciseContact(world: World, objective: Objective, seat: PlayerId, drive: Drive) {
  const { state } = world, player = state.players[seat];
  const { room, spawn, tile } = findTrigger(world.campaign, objective);
  enterRoom(world, player, room.id);
  const move = (buttons: number, frames = 1) =>
    drive(seat === 'mario' ? buttons : 0, seat === 'luigi' ? buttons : 0, frames);
  const place = (x: number, y: number, vy = 0) => {
    Object.assign(player, { x, y, vx: 0, vy, grounded: false });
  };
  const active = (kind: EntityState['kind']) =>
    state.entities.find((e) => e.active && e.roomId === room.id && e.kind === kind);
  if (tile !== undefined) {
    place((tile % room.width) * 16 + 2, Math.floor(tile / room.width) * 16 - player.height - 1, 1);
    await move(0);
  } else if (spawn!.spriteId === 0x0e) {
    let key = active('key');
    if (!key) {
      const index = keyBlock(room, player, state.courseCoins);
      place((index % room.width) * 16 + 2, (Math.floor(index / room.width) + 1) * 16, -3);
      await move(0);
      key = active('key');
    }
    assert.ok(key, 'missing key in ' + room.id);
    place(key.x, key.y);
    await move(Buttons.run);
    assert.equal(player.carrying, key.id, 'collect key in ' + room.id);
    place(spawn!.x, spawn!.y);
    await move(Buttons.run);
  } else if (spawn!.spriteId === 0x29 || spawn!.spriteId === 0xa9 || spawn!.spriteId === 0xc5) {
    // Bring the appropriate physical attack into contact with each live boss.
    // Boss HP and hazards stay unchanged, including all four moving Reznors.
    // Three pipe cycles at 300 PAL frames each allow all three vulnerable windows.
    const deadline = state.tick + 3 * 360;
    while (state.tick < deadline && state.phase === 'playing' && !state.bonus) {
      const boss = active('boss');
      assert.ok(boss, 'missing boss in ' + room.id);
      if (isPipeBoss(boss) && (boss.height < 12 || (boss.stunnedUntil ?? 0) > boss.age)) {
        const pipe = room.tiles.findIndex((t, index) => {
          if (t !== 0x133) return false;
          const x = (index % room.width) * 16;
          return !state.entities.some((e) => e.active && e.roomId === room.id &&
            x + player.width > e.x && x < e.x + e.width);
        });
        assert.notEqual(pipe, -1);
        place((pipe % room.width) * 16, Math.floor(pipe / room.width) * 16 - player.height);
        await move(0, 12);
      } else if (boss.spriteId === 0xc5) {
        const block = room.tiles.findIndex((t, n) => t === 0x12e && state.tileChanges[room.id]?.[n] === undefined);
        assert.ok(block >= 0);
        place((block % room.width) * 16 + 2, Math.floor(block / room.width) * 16 - player.height);
        await move(0);
        await move(Buttons.run);
        assert.ok(player.carrying, 'pick up a throw block');
        place(boss.x + boss.width + 8, boss.y + boss.height + 10);
        await move(Buttons.left | Buttons.run);
        await move(Buttons.up, 10);
      } else if (boss.spriteId === 0xa9) {
        place(boss.x, boss.y + boss.height - 3, -3);
        await move(Buttons.jump);
      } else if ((room.id === '1f6' || room.id === '1eb') && (boss.x + boss.width / 2 < 41 || boss.x + boss.width / 2 > 215)) {
        place(128, 96);
        await move(0);
      } else {
        place(boss.x, boss.y - player.height + 1, 2);
        await move(Buttons.jump);
      }
    }
  } else {
    place(spawn!.x - 3, spawn!.y);
    await move(Buttons.right | Buttons.run);
  }
  assert.ok(state.progress.completed.includes(objective.id), 'exit did not register: ' + objective.id);
}

function keyBlock(room: LevelDefinition, player: PlayerState, coins: number) {
  const index = room.tiles.findIndex((t, i) => {
    if (!(t >= 0x111 && t <= 0x12d || t >= 0x21 && t <= 0x24)) return false;
    return blockReward(t, i % room.width, player, coins) === 0x80;
  });
  assert.ok(index >= 0, 'missing key source in ' + room.id);
  return index;
}
