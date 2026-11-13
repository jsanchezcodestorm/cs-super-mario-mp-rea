import { createGame, stepGame, palFrame } from '@smw/core';
import { startCourse } from '../../packages/core/src/campaign.ts';
import { queueBooGroups } from '../../apps/web/src/game/boo-cluster-view.ts';

export function captureBooRings(scene, content, show) {
  const shots = [], examples = {};
  for (const [roomId, center, phase, seat] of [['107',496,238,'mario'], ['0ed',784,126,'luigi']]) {
    const c = { ...content, start: roomId, initial: [roomId] };
    const state = createGame(c);
    startCourse({ campaign:c, state },roomId);
    state.entrance = null;
    const p = state.players[seat];
    p.roomId = roomId;
    p.x = center;
    p.y = 305;
    state.players[seat === 'mario' ? 'luigi' : 'mario'].status = 'spectator';
    state.tick = Math.ceil((phase - 96) * 6 / 5);
    while (palFrame(state.tick) < phase) {
      p.x = center;
      p.y = 305;
      stepGame(c,state,{mario:0,luigi:0});
    }
    show(state, seat);
    scene.update(0,0);
    const label = 'boo-ring-' + roomId;
    examples[label] = scene.terrain.canvas.toDataURL();
    const canvas = document.createElement('canvas');
    canvas.width=256;canvas.height=224;
    const ctx = canvas.getContext('2d');
    queueBooGroups(scene, scene.objects, roomId, state, {x:center-128,y:208});
    scene.objects.compose();
    scene.objects.paint(ctx,3);
    shots.push({label, bytes:Array.from(ctx.getImageData(0,0,256,224).data.filter((_,i)=>i%4===3))});
  }
  return { shots,examples };
}
