// Mounted Yoshi uses different dynamic head tiles for preparation, extension,
// and swallowing. Run each pose independently with a fresh OAM allocation.
typedef struct {
    int pose, tongue, windup, swallow, pipe, loose, clock;
} YoshiSample;

static const YoshiSample yoshi_samples[] = {
    {0}, {1}, {7, 6}, {0, 0, 0, 17}, {4}, {0, 0, 4}, {6, 6},
    {2}, {5}, {5, 6}, {2, 6}, {4, 0, 4}, {4, 0, 0, 17},
    {2, 0, 4}, {5, 0, 4}, {1, 0, 4},
    {.pose=8, .pipe=1}, {.pose=9, .pipe=1}, {.pose=0, .pipe=2},
    // Waiting Yoshi changes just his head every 48/16 frames. After a hit,
    // the head and the three successive running poses use independent clocks.
    {.pose=4, .loose=1, .clock=16}, {.pose=4, .loose=1},
    {.pose=0, .loose=2}, {.pose=1, .loose=2}, {.pose=2, .loose=2},
    {.pose=0, .loose=2, .clock=16}, {.pose=1, .loose=2, .clock=16}, {.pose=2, .loose=2, .clock=16},
    {.pose=10, .loose=1, .clock=16}, {.pose=11, .loose=1, .clock=16}, {.pose=12, .loose=1, .clock=16},
    {.pose=12, .loose=1, .clock=0}
};

static int capture_yoshi(void) {
    const int base = actor_oam();
    for (unsigned i = 0; i < sizeof yoshi_samples / sizeof *yoshi_samples; i++) {
        YoshiSample s = yoshi_samples[i];
        clear_oam();
        ram[0x15ea + actor_slot] = base;
        ram[0x157c + actor_slot] = 1;
        ram[0x15f6 + actor_slot] = 0x0a;
        ram[0xc2 + actor_slot] = s.loose == 1 ? 0 : s.loose == 2 ? 2 : 1;
        ram[0x14] = s.clock;
        ram[0x1602 + actor_slot] = s.pose;
        ram[0x151c + actor_slot] = s.tongue;
        ram[0x18ae] = s.windup;
        ram[0x1564 + actor_slot] = s.swallow;
        ram[0x160e + actor_slot] = 0xff;
        ram[0x1419] = s.pipe;
        if (!run_actor(0x01ee61, 0)) return 5;
        upload_dynamic_tiles();
        if (fwrite(ram + 0x200, 1, 0x2a0, stdout) != 0x2a0 ||
            fwrite(vram, 1, sizeof vram, stdout) != sizeof vram) return 4;
    }
    return 0;
}
