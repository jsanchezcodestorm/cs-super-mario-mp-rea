// Mounted Yoshi uses different dynamic head tiles for preparation, extension,
// and swallowing. Run each pose independently with a fresh OAM allocation.
typedef struct {
    int pose, tongue, windup, swallow, pipe;
} YoshiSample;

static const YoshiSample yoshi_samples[] = {
    {0}, {1}, {7, 6}, {0, 0, 0, 17}, {4}, {0, 0, 4}, {6, 6},
    {2}, {5}, {5, 6}, {2, 6}, {4, 0, 4}, {4, 0, 0, 17},
    {2, 0, 4}, {5, 0, 4}, {1, 0, 4},
    {.pose=8, .pipe=1}, {.pose=9, .pipe=1}, {.pose=0, .pipe=2}
};

static int capture_yoshi(void) {
    const int base = read8(NULL, 0x07f000 + read8(NULL, 0x07f0b4 + ram[0x1692]));
    for (unsigned i = 0; i < sizeof yoshi_samples / sizeof *yoshi_samples; i++) {
        YoshiSample s = yoshi_samples[i];
        clear_oam();
        ram[0x15ea] = base;
        ram[0x157c] = 1;
        ram[0x15f6] = 0x0a;
        ram[0xc2] = 1;
        ram[0x1602] = s.pose;
        ram[0x151c] = s.tongue;
        ram[0x18ae] = s.windup;
        ram[0x1564] = s.swallow;
        ram[0x160e] = 0xff;
        ram[0x1419] = s.pipe;
        if (!run_actor(0x01ee61, 0)) return 5;
        upload_dynamic_tiles();
        if (fwrite(ram + 0x200, 1, 0x2a0, stdout) != 0x2a0 ||
            fwrite(vram, 1, sizeof vram, stdout) != sizeof vram) return 4;
    }
    return 0;
}
