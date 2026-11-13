// The PAL line guide draws a 3- or 5-tile deck. The motor draws a 5- or
// 9-tile rope; its length depends on the sprite slot and memory setting.
static int capture_rail(int id) {
    const int poses = id == 0x64 ? 8 : 2;
    for (int i = 0; i < poses; i++) {
        actor_slot = id == 0x64 ? (i >= 4 ? 7 : 4) : capture_slot(id);
        ram[0x9e + actor_slot] = id;
        if (!run_actor(0x07f7d2, 1)) return 5;
        const int long_rope = id == 0x64 && i >= 4;
        if (long_rope) ram[0x1692] = 1;  // slot 7 in Cheese Bridge Area
        npc_origin(((i & 3) << 3) ^ (actor_slot << 2), 0, actor_oam());
        if (id == 0x64) ram[0xd8 + actor_slot] = 64;  // fit the entire rope in visible OAM
        ram[0x1602 + actor_slot] = i;
        ram[0x14c8 + actor_slot] = 8;
        ram[0x9d] = 1;
        if (!run_actor(id == 0x64 ? 0x01dc62 : 0x01b2e6, 0)) return 5;
        if (npc_record()) return 4;
    }
    return 0;
}
