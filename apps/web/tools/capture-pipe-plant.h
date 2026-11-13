// Bank 01 draws a classic plant from $1602. Bank 02 draws jumping heads
// and leaves from two independent counters ($1570, $151C).
static int capture_pipe_plant(int id) {
    int jumping = id == 0x4f || id == 0x50;
    if (!run_actor(0x01808c, 1)) return 5; // Keep INIT's flip for $2A.
    ram[0x9d] = 1; // Draw at the requested pose with motion suspended.
    ram[0xe4 + actor_slot] = ram[0xd8 + actor_slot] = 96;
    ram[0x14e0 + actor_slot] = ram[0x14d4 + actor_slot] = 0;
    memset(ram + 0x1a, 0, 4);
    for (int pose = 0; pose < (jumping ? 4 : 2); pose++) {
        clear_oam();
        if (jumping) {
            ram[0x1570 + actor_slot] = (pose >> 1) * 8;
            ram[0x151c + actor_slot] = (pose & 1) * 4;
        } else {
            ram[0x1602 + actor_slot] = pose;
        }
        if (!run_actor(0x01808c, 1)) return 5;
        if (fwrite(ram + 0x200, 1, 0x2a0, stdout) != 0x2a0 ||
            fwrite(vram, 1, sizeof vram, stdout) != sizeof vram) return 4;
    }
    return 0;
}
