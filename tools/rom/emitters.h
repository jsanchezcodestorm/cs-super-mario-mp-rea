// Capture the output of the E1 cartridge's generator dispatcher in an empty
// viewport. Records travel with their generator period and share its RNG stream.
static int relative_position(int low, int high, int slot) {
    return (int16_t)(ram[low + slot] | (ram[high + slot] << 8)) - 0x200;
}

static void sample_emissions(void) {
    putchar('{');
    for (int id = 0xcb; id <= 0xd8; id++) {
        memset(ram, 0, sizeof ram);
        ram[0x1b] = ram[0x1d] = 2; // Layer 1 camera at (512, 512).
        ram[0xd1] = 128;
        ram[0xd2] = ram[0xd4] = 2;
        ram[0xd3] = 112;
        ram[0x18b9] = id - 0xca;
        // Six complete 322-tick volley cycles; all other emission periods
        // divide 2048. The seed is reset separately for each generator.
        int period = id == 0xd6 || id == 0xd7 ? 1932 : 2048;
        int count = 0;
        printf("%s\"%d\":{\"period\":%d,\"events\":[", id == 0xcb ? "" : ",", id, period);
        for (int frame = 0; frame < period; frame++) {
            ram[0x13] = ram[0x14] = (uint8_t)frame;
            run_bank(0x02affe, false, 2);
            for (int slot = 0; slot < 12; slot++) {
                if (!ram[0x14c8 + slot]) continue;
                printf("%s[%d,%d,%d,%d,%.4f,%.4f,%d,%d]", count ? "," : "",
                    frame, ram[0x9e + slot], relative_position(0xe4,0x14e0,slot),
                    relative_position(0xd8,0x14d4,slot),
                    (int8_t)ram[0xb6 + slot]/16.0, (int8_t)ram[0xaa + slot]/16.0,
                    ram[0xc2 + slot], ram[0x157c + slot]);
                // The observer consumes all newly occupied slots after this
                // dispatcher call, leaving capacity for the next emission.
                ram[0x14c8 + slot] = 0;
                count++;
            }
        }
        fputs("]}", stdout);
    }
    puts("}");
}
