// Draw the requested state directly through the PAL sprite's graphics routine.
// Each sample starts at the same native world origin. No AI runs between poses.
static int capture_resident(int id, int count) {
    ram[0x9e + actor_slot] = id;
    if (!run_actor(0x07f7d2, 1)) return 5;
    int oamBase = actor_oam();
    const int attributes = ram[0x15f6 + actor_slot];
    ram[0x14c8 + actor_slot] = 8;
    ram[0x64] = 0x20;
    ram[0x9d] = 1;
    ram[0xe4 + actor_slot] = ram[0xd8 + actor_slot] = 96;
    ram[0x14e0 + actor_slot] = ram[0x14d4 + actor_slot] = 0;
    memset(ram + 0x1a, 0, 4);
    for (int sample = 0; sample < count; sample++) {
        clear_oam();
        ram[0x15ea + actor_slot] = oamBase;
        int pose = sample / 2;
        ram[0x157c + actor_slot] = !(sample & 1);
        ram[0x1602 + actor_slot] = pose;
        uint32_t routine;
        int far_call = 0;
        switch (id) {
            case 0x4b: routine = 0x02e9ec; break;
            case 0x4c: routine = 0x0190b2; far_call = 1; break;
            case 0xbc:
                ram[0x15f6 + actor_slot] = pose ? 1 : attributes;
                ram[0x1602 + actor_slot] = pose == 2;
                routine = 0x038b3d;
                break;
            case 0xb3:
                ram[0x14] = pose * 2;
                routine = 0x038f1b;
                break;
            case 0xb0:
                ram[0xb6 + actor_slot] = (sample & 1) ? 16 : 240;
                routine = 0x038f7a;
                break;
            case 0x8a:
                ram[0x1602 + actor_slot] = (int[]){0,1,4}[pose % 3];
                routine = 0x02f3ea;
                break;
            case 0x90:
                ram[0x1570 + actor_slot] = sample * 8;
                routine = 0x02e3aa;
                break;
            case 0xa8:
                ram[0xc2 + actor_slot] = pose == 0 ? 1 : 4;
                ram[0x1602 + actor_slot] = pose == 2;
                routine = 0x03a062;
                break;
            case 0xae:
                ram[0x1602 + actor_slot] = pose / 8;
                ram[0x14] = (pose % 8) * 4;
                routine = 0x039180;
                break;
            case 0xaf:
                ram[0xb6 + actor_slot] = (int[]){8,4,0}[pose];
                routine = 0x01f9ce;
                break;
            case 0x9d: {
                int phase = sample % 7;
                ram[0xc2 + actor_slot] = sample / 7;
                ram[0x14] = (phase % 4) * 8;
                ram[0x1534 + actor_slot] = phase < 4 ? 255 : (int[]){16,3,2}[phase-4];
                routine = 0x02d8bb;
                break;
            }
            default: return 3;
        }
        if (!run_actor(routine, far_call)) return 5;
        if (id == 0xb0) {
            // The head alternates between two tiles for each of the four slot variants.
            // Trails live in a separate 12-slot minor-extended OAM table.
            if (pose < 8) ram[0x302 + oamBase] = read8(NULL, 0x038f6d + pose);
            else {
                int slot = pose - 8;
                int index = read8(NULL, 0x028b78 + slot);
                clear_oam();
                ram[0x200+index] = ram[0x201+index] = 96;
                ram[0x202+index] = read8(NULL, 0x028cb8 + slot);
                ram[0x203+index] = 0x2f | ((sample & 1) ? 0x40 : 0);
                ram[0x420+index/4] = 2;
            }
        }
        if (id == 0x8a) {
            // BirdsPal indexes the four birds by native sprite slot.
            int slot = read8(NULL, 0x02f3e6 + actor_slot) / 4;
            int palette = read8(NULL, 0x02f3e2 + sample / 6);
            ram[0x203 + 4*slot] = (ram[0x203 + 4*slot] & 0xf1) | palette;
        }
        if (fwrite(ram+0x200,1,0x2a0,stdout)!=0x2a0 || fwrite(vram,1,sizeof vram,stdout)!=sizeof vram) return 4;
    }
    return 0;
}
