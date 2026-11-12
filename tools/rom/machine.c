// Offline bus for SMW E1's level, palette and graphics loaders.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vendor/lakesnes/cpu.h"

static uint8_t rom[0x80000], ram[0x20000], vram[0x10000], io[0x10000];
static uint16_t vram_address;

static uint8_t read8(void *unused, uint32_t address) {
    (void)unused;
    unsigned bank = address >> 16, offset = address & 0xffff;
    if (bank == 0x7e || bank == 0x7f) return ram[address - 0x7e0000];
    if (offset >= 0x8000) return rom[(bank & 15) * 0x8000 + (offset & 0x7fff)];
    if (offset < 0x2000) return ram[offset];
    return io[offset];
}

static void write8(void *unused, uint32_t address, uint8_t value);

static void dma_channel_2(void) {
    // The graphics loader uses alternating low and high VRAM ports.
    if (io[0x4320] != 1 || io[0x4321] != 0x18) {
        fprintf(stderr, "Unexpected graphics DMA mode\n");
        exit(1);
    }
    unsigned source = io[0x4322] | (io[0x4323] << 8) | (io[0x4324] << 16);
    unsigned count = io[0x4325] | (io[0x4326] << 8);
    for (unsigned i = 0; i < count; i++) {
        write8(NULL, 0x2118 + (i & 1), read8(NULL, source + i));
    }
}

static void write8(void *unused, uint32_t address, uint8_t value) {
    (void)unused;
    unsigned bank = address >> 16, offset = address & 0xffff;
    if (bank == 0x7e || bank == 0x7f) {
        ram[address - 0x7e0000] = value;
        return;
    }
    if (offset < 0x2000) {
        ram[offset] = value;
        return;
    }
    if (offset >= 0x8000) {
        fprintf(stderr, "Unexpected ROM write at %06x\n", address);
        exit(1);
    }
    io[offset] = value;
    if (offset == 0x420b && value == 4) dma_channel_2();
    if (offset == 0x2116 || offset == 0x2117) {
        vram_address = io[0x2116] | (io[0x2117] << 8);
    }
    if (offset == 0x2118 || offset == 0x2119) {
        vram[(2 * vram_address + (offset & 1)) & 0xffff] = value;
        if ((offset & 1) == (io[0x2115] >> 7)) vram_address++;
    }
}

static void idle(void *unused, bool waiting) {
    (void)unused;
    (void)waiting;
}

static void run_bank(uint32_t entry, bool far, uint8_t bank) {
    Cpu *cpu = cpu_init(NULL, read8, write8, idle);
    cpu_reset(cpu, true);
    cpu->resetWanted = false;
    cpu->pc = entry & 0xffff;
    cpu->k = entry >> 16;
    cpu->db = bank;
    cpu->mf = cpu->xf = true;
    cpu->sp = far ? 0x1fc : 0x1fd;
    // RTS/RTL add one to the caller's saved return address.
    ram[cpu->sp + 1] = 0xff;
    ram[cpu->sp + 2] = 0x5f;
    if (far) ram[0x1ff] = 0;
    for (int n = 0; cpu->pc != 0x6000; n++) {
        if (n > 4000000) {
            fprintf(stderr, "Routine %06x did not return, stopped at %02x:%04x\n", entry, cpu->k, cpu->pc);
            exit(1);
        }
        cpu_runOpcode(cpu);
    }
    cpu_free(cpu);
}

static void run(uint32_t entry, bool far) {
    run_bank(entry, far, 0);
}

#include "emitters.h"

static void set_pointer(int address, int pointer) {
    ram[address] = pointer;
    ram[address + 1] = pointer >> 8;
    ram[address + 2] = pointer >> 16;
}

int main(int argc, char **argv) {
    if (argc != 3 && argc != 4) return 1;
    FILE *file = fopen(argv[1], "rb");
    if (!file || fread(rom, 1, sizeof rom, file) != sizeof rom) return 1;
    fclose(file);
    if (argc == 3) {
        if (strcmp(argv[2], "emitters")) return 1;
        sample_emissions();
        return 0;
    }
    run(0x00b89b, false); // Decompress the animated character banks into WRAM.
    set_pointer(0x65, atoi(argv[2]));
    set_pointer(0x68, atoi(argv[3]));
    ram[0x0100] = 0x22; // Skip live sprite activation after loading layout.
    run(0x05801e, true);
    run(0x00abf4, false); // Compose the level palette in WRAM.
    memset(ram + 0x101, 0xff, 8); // All graphics banks require upload.
    run(0x00a9e1, false);
    if (fwrite(ram, 1, sizeof ram, stdout) != sizeof ram) return 1;
    // A full 8-tick cycle updates the 24 animated character slots.
    for (int frame = 0; frame < 32; frame++) {
        ram[0x14] = frame;
        run(0x05bb49, true);
        run(0x00a397, false);
        if (frame % 8 == 7 && fwrite(vram, 1, sizeof vram, stdout) != sizeof vram) return 1;
    }
    return 0;
}
