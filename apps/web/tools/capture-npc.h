// Both facings are drawn by the E1 routine at the same sprite origin. The
// engine's facing byte is 1 for left, 0 for right; some actors additionally
// read their speed, head direction, history, or tile attributes.
static int npc_record(void) {
    if (fwrite(ram+0x200, 1, 0x2a0, stdout) != 0x2a0 ||
        fwrite(vram, 1, sizeof vram, stdout) != sizeof vram) return 4;
    return 0;
}

static void npc_origin(int frame, int right, int base) {
    clear_oam();
    ram[0xe4 + actor_slot] = ram[0xd8 + actor_slot] = 96;
    ram[0x14e0 + actor_slot] = ram[0x14d4 + actor_slot] = 0;
    memset(ram+0x1a, 0, 4);
    ram[0x13] = ram[0x14] = frame;
    ram[0x15ea + actor_slot] = base;
    ram[0x157c + actor_slot] = !right;
    ram[0xb6 + actor_slot] = right ? 8 : 0xf8;
    ram[0x1570 + actor_slot] = frame;
    ram[0x1602 + actor_slot] = (frame >> 3) & 1;
    ram[0x64] = 0x20;
}

static int npc_state_pose(const char *track, int i, int right) {
    if (!strcmp(track, "kick")) {
        ram[0x1602 + actor_slot] = 4; // ShellessKoopas, C2 from $20 down to $08.
        return run_actor(0x018bc3, 0);
    }
    if (!strcmp(track, "ground")) {
        ram[0x1602 + actor_slot] = i >> 1;
        ram[0x1588 + actor_slot] = 4;
        return run_actor(0x018bc3, 0);
    }
    if (!strcmp(track, "lakitu")) {
        ram[0x1558 + actor_slot] = (i >> 1) == 1 ? 32 : 0;
        ram[0x151c + actor_slot] = (i >> 1) == 2;
        return run_actor(0x018f97, 0);
    }
    if (!strcmp(track, "flop")) {
        ram[0x1602 + actor_slot] = 2 + (i >> 1);
        return run_actor(0x01b111, 0);
    }
    if (!strcmp(track, "turn")) {
        ram[0x15ac + actor_slot] = 1;
        return run_actor(0x018bc3, 0); // Spr0to13Gfx selects the turning image.
    }
    if (!strcmp(track, "net")) {
        if (i >= 20) {
            ram[0x1632 + actor_slot] = (i - 20) >> 1;
            return run_actor(0x019b1f, 0); // HandleSpriteDeath, with this Koopa's tweaker bytes.
        }
        if (i < 4) {
            ram[0x1632 + actor_slot] = i >> 1;
            ram[0x1570 + actor_slot] = (i & 1) << 3;
            return run_actor(0x01ba5a, 0);
        }
        int state = i-4;
        ram[0xc2 + actor_slot] = state >> 3;
        ram[0x1632 + actor_slot] = (state >> 2) & 1;
        ram[0x1540 + actor_slot] = state & 2 ? 0x38 : 0x30;
        return run_actor(0x01b986, 0);
    }
    if (!strcmp(track, "bill")) {
        // BulletBill's C2 indexes both BulletGfxProp and DATA_018FCF.
        ram[0x157c + actor_slot] = 1;
        ram[0x15f6 + actor_slot] = read8(NULL, 0x018fc7 + i);
        ram[0x1602 + actor_slot] = read8(NULL, 0x018fcf + i);
        return run_actor(0x019f19, 0);
    }
    if (!strcmp(track, "boo")) {
        int pose = i >> 1;
        ram[0x1602 + actor_slot] = pose == 4 ? 3 : pose;
        ram[0xc2 + actor_slot] = pose != 0;
        // Small Boo selects two peek tiles. Big Boo lowers both eyes by
        // five pixels when peeking during its otherwise stationary pose.
        ram[0x1558 + actor_slot] = ram[0x9e + actor_slot] == 0x28 ? (pose == 4) : pose < 2 ? 0 : pose == 2 ? 8 : 4;
        return run_actor(0x038398, 1);
    }
    if (!strcmp(track, "chuck") || !strcmp(track, "digChuck")) {
        static const int dig_poses[] = {5, 14, 15, 16};
        int digging = !strcmp(track, "digChuck");
        ram[0x9e + actor_slot] = digging ? 0x46 : 0x91; // Only sprite $46 draws the shovel.
        ram[0x1602 + actor_slot] = digging ? dig_poses[i >> 1] : i >> 1;
        // CODE_02C556 independently turns the head to the player's side.
        ram[0x151c + actor_slot] = right ? 0 : 4;
        return run_actor(0x02c81a, 0);
    }
    return 0;
}

static int npc_walk_pose(int id, int frame, int right, int stomped) {
    const int stride = (frame >> 3) & 1;
    if (id <= 0x0f || id == 0x11 || id == 0x13) return run_actor(0x018bc3, 0);
    switch (id) {
        case 0x10: return run_actor(0x018dac, 0); // Winged Goomba
        case 0x15: case 0x16: case 0x17: case 0x18:
            return run_actor(0x01b111, 0); // Cheep Cheep, swimming tiles
        case 0x1d: case 0x38: case 0x39: return run_actor(0x019f19, 0);
        case 0x1e:
            ram[0x151c + actor_slot] = 0; // The Lakitu cloud is separately positioned.
            return run_actor(0x018f97, 0);
        case 0x1f:
            ram[0x1540 + actor_slot] = (frame < 16 ? 0x6f : 0x3f) - (frame & 15);
            // Enter just after SubHorizPos writes the direction. $1540
            // selects raised/lowered wand and the alternating body tile.
            return run_actor(0x01be82, 0);
        case 0x2d:
            ram[0x14c8 + actor_slot] = 9;
            ram[0x1602 + actor_slot] = frame & 0x18 ? 0 : 3;
            return run_actor(0x01a35b, 0);
        case 0x2e:
            // Ground-facing Spike Top, c2 is the surface/direction index.
            ram[0xc2 + actor_slot] = right ? 0 : 4;
            ram[0x157c + actor_slot] = 1;
            return run_actor(0x02bcdb, 1);
        case 0x30: case 0x31: case 0x32: return run_actor(0x03c390, 1);
        case 0x3d: return run_actor(0x019f19, 0);
        case 0x41: case 0x42: return run_actor(0x02bc14, 0);
        case 0x44: return run_actor(0x02b8f7, 0);
        case 0x47:
            ram[0x1602 + actor_slot] = (frame >> 2) & 1;
            return run_actor(0x019f19, 0);
        case 0x4d: case 0x4e:
            // The floor/ledge disturbance is a separate pose from the live mole.
            ram[0x1602 + actor_slot] = (frame >> 2) & 1;
            return run_actor(0x019f19, 0);
        case 0x51: return run_actor(0x019f19, 0);
        case 0x6e: case 0x6f:
            ram[0x151c + actor_slot] = 0;
            return run_actor(0x039e49, 0);
        case 0x71: case 0x72: case 0x73:
            ram[0x1602 + actor_slot] = 2 + ((frame >> 2) & 1);
            return run_actor(0x02ecde, 0);
        case 0x86:
            // Wiggler reads five offsets into its 64-position body history.
            if (!run_actor(0x02f011, 0)) return 0;
            for (int age = 0; age < 64; age++) {
                ram[0x19a7b + 2*age] = 96 + (right ? -1 : 1) * ((age+1)/2);
                ram[0x19a7b + 2*age + 1] = 96;
            }
            ram[0xc2 + actor_slot] = right ? 0 : 0x1f;
            return run_actor(0x02f110, 0);
        case 0x9a: return run_actor(0x02de3e, 0);
        case 0x9b:
            ram[0x157c + actor_slot] = right ? 0x40 : 0;
            return run_actor(0x02dafd, 0);
        case 0xa2:
            ram[0x1602 + actor_slot] = (frame >> 2) & 3;
            ram[0x1540 + actor_slot] = stomped ? 0x80 : 0;
            return run_actor(0x03b355, 0);
        case 0xaa:
            ram[0x1602 + actor_slot] = (frame >> 1) & 1;
            return run_actor(0x03978c, 0);
        case 0xab:
            ram[0x1602 + actor_slot] = stomped ? 3 + ((frame >> 2) & 1) : stride;
            return run_actor(0x03967e, 0);
        case 0xbd: return run_actor(0x038964, 0);
        case 0xbe:
            ram[0x1602 + actor_slot] = 1 + ((frame >> 2) & 1);
            return run_actor(0x0388a3, 0);
        case 0xbf:
            ram[0x151c + actor_slot] = !right; // Mega Mole's delayed head direction.
            return run_actor(0x03883f, 0);
        case 0xc2: return run_actor(0x0384ca, 0);
        case 0xc3: return run_actor(0x0385a3, 0);
    }
    return 0;
}

static int capture_npc(int id, const char *track, int count, int right, int stomped) {
    ram[0x9e + actor_slot] = id;
    if (!run_actor(0x07f7d2, 1)) return 5;
    ram[0x14c8 + actor_slot] = 8;
    ram[0x9d] = 1;
    int base = actor_oam();
    for (int i = 0; i < count; i++) {
        int walk = !strcmp(track, "walk");
        int face = walk ? right : i & 1;
        npc_origin(i, face, base);
        if (!(walk ? npc_walk_pose(id, i, face, stomped) : npc_state_pose(track, i, face))) return 5;
        upload_dynamic_tiles();
        if (npc_record()) return 4;
    }
    return 0;
}
