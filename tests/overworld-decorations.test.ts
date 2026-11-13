import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buttons, createGame, palFrame, stepGame, type CampaignDefinition, type MapCloud } from '@smw/core';
import { advanceClouds } from '../packages/core/src/overworld-clouds.ts';
import { decorationParts, type Decorations } from '../apps/web/src/game/map-decorations.ts';
import { mapObjectMask } from '../apps/web/src/game/map-obj-mask.ts';

const data: Decorations = JSON.parse(readFileSync('generated/world/decorations.json','utf8'));
const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json','utf8'));
const camera = { x: 0, y: 0 };

test('native map OAM cycles and submap origins distinguish both faces of the Boos, smoke and Bowser', () => {
  assert.deepEqual(data.actors.filter(a => a.region === 0).map(a => [a.slot,a.track.frames.length]),
    [[13,768],[14,768],[15,768],[6,192]]);
  const dungeon = data.actors.filter(a => a.region === 4);
  assert.deepEqual(dungeon.map(a => [a.slot,a.track.frames.length]),[[14,768],[8,16],[9,960]]);
  for (const region of [2,3,4]) {
    const actor = data.actors.find(a => a.region === region && a.slot >= 13)!;
    const oam = actor.slot + 58;
    const main = decorationParts(data,0,12,true,undefined,camera).find(p => p[3] === oam)!;
    const target = decorationParts(data,region,12,true,undefined,camera).find(p => p[3] === oam)!;
    assert.deepEqual(target,[main[0]+actor.offset[0]-(region >= 4 ? 256 : 0),
      main[1]+actor.offset[1]-[0,0,160,336,0,160,336][region],main[2],oam]);
    assert.deepEqual(new Set(actor.track.frames.map(parts => data.priorities[parts[0][2]])),new Set([0,3]));
  }
  assert.equal(decorationParts(data,3,0,false,undefined,camera).length,0);
  assert.equal(decorationParts(data,5,0,true,undefined,camera).length,0);
  assert.equal(decorationParts(data,6,0,true,undefined,camera).length,0);
});

test('six native fish crossings retain the PAL arc, its splash and the single slot after either player arrives', () => {
  assert.deepEqual(Object.entries(data.fish).map(([k,v]) => [k,v.start,v.frames.length]), [
    ['004/right',32,79],['005/left',31,79],['00f/right',1,79],['010/left',31,79],['018/left',36,79],['01a/up',51,79],
  ]);
  for (const key of Object.keys(data.fish)) {
    const [from,cmd] = key.split('/');
    const command = cmd as 'left' | 'right' | 'up';
    const edge = campaign.overworldPaths![from].directions[command]!;
    const catalog = { ...campaign, start:from, initial:[from,edge.to] };
    const state = createGame(catalog);
    const luigi = state.mapPlayers.luigi;
    stepGame(catalog,state,{mario:0,luigi:Buttons[command]});
    assert.ok(luigi.travel);
    const seen = new Set<number>();
    let tail = 0;
    for (let i = 0; i < 220; i++) {
      stepGame(catalog,state,{mario:0,luigi:0});
      const arrival = luigi.arrival;
      const last = arrival && { ...arrival, elapsed:state.tick-arrival.departed };
      const frame = palFrame(state.tick);
      const parts = decorationParts(data,0,frame,false,state.mapClouds?.luigi,camera,luigi.travel,last);
      const fish = parts.find(p => p[3] === 70);
      if (!fish) continue;
      assert.equal(data.priorities[fish[2]],1);
      seen.add(fish[1]);
      if (!luigi.travel) tail++;
    }
    assert.equal(seen.size,29,key);
    assert.ok(tail >= 9,key);
    assert.equal(state.phase,'map');
    assert.equal(luigi.stop,edge.to);
  }
});

test('cloud spawn, fractional drift, camera recycling and OBJ slots follow bank 04', () => {
  const clouds: (MapCloud | null)[] = [null,null,null];
  advanceClouds(clouds,0,80,32);
  assert.deepEqual(clouds[0], {x:64.125,y:143.9375,z:112});
  for (let i=1;i<17;i++) advanceClouds(clouds,i,80,32);
  assert.deepEqual(clouds[0], {x:66.125,y:142.9375,z:112});
  const anchor = {x:128,y:160,z:112};
  const parts = decorationParts(data,0,0,false,[anchor],camera);
  assert.deepEqual(parts.find(p => p[3] === 28),[128,48,data.clouds[0],28]);
  assert.deepEqual(parts.find(p => p[3] === 27),[144,48,data.clouds[1],27]);
  advanceClouds(clouds,17,200,100);
  assert.equal(clouds[0],null);
  advanceClouds(clouds,18,200,100);
  assert.deepEqual(clouds[0], {x:392.125,y:443.9375,z:120});
});

test('low OBJs are occluded by the current native BG1 pixels, including new paths and animated cells', () => {
  const events = JSON.parse(readFileSync('generated/world/events.json','utf8'));
  const map = data.occlusion.regions[0];
  const [exit] = Object.entries(events.ids).find(([,id]) => id === 1)!;
  const change = map.events[1].find(([cell,,track]) => track !== map.base[cell])!;
  const x = (change[0] % map.cols)*8, y = Math.floor(change[0]/map.cols)*8;
  const base = mapObjectMask(data.occlusion,0,0,[],events.ids);
  const advanced = mapObjectMask(data.occlusion,0,0,[exit],events.ids);
  assert.ok(Array.from({length:64},(_,i) => base(x+i%8,y+(i>>3)) !== advanced(x+i%8,y+(i>>3))).some(Boolean));
  assert.ok(data.occlusion.tracks.some(t => new Set(t).size > 1));
});

test('reversing at Cheese Bridge Area never starts the second Cheep Cheep halfway through its jump', () => {
  const asTicks = (frame: number) => Math.ceil(frame*6/5);
  const fish = (now: number, next: number) => decorationParts(data,0,now,false,undefined,camera,
    {from:'00f',command:'right',elapsed:asTicks(now-next)},
    {from:'010',command:'left',elapsed:asTicks(now)}).find(part => part[3] === 70);
  // The return trip crosses the trigger while the previous fish is still airborne.
  assert.equal(fish(115,62),undefined);
  // Waiting before reversing keeps the trigger occupied until the old slot clears.
  const delayed = fish(115,96);
  const previous = data.fish['010/left'];
  const born = previous.start + previous.frames.length + 1;
  assert.equal(delayed?.[1],data.fish['00f/right'].frames[115-born].find(p => p[3] === 70)?.[1]);
});
