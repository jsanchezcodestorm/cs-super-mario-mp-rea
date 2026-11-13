// Run the E1 cartridge's sprite initializer and per-frame draw routine against
// a loaded level's memory. Captures contain original OAM commands, not screenshots.
#define main extract_room_entry
#include "../../../tools/rom/machine.c"
#undef main

static int load(const char *path, void *data, size_t size) {
    FILE *f=fopen(path,"rb");
    if (!f) return 0;
    size_t n=fread(data,1,size,f); fclose(f);
    return n==size;
}

// The level loader scans a memory-setting-specific range. Capture at the
// lowest legal slot so the same species has a deterministic reference pose;
// excluded slots can map directly over Mario at OAM 64–71 (e.g. setting 7).
static int actor_slot;

static int capture_slot(int id) {
    int setting = ram[0x1692];
    // For $64 the second reserved range applies only when spawn X & $10.
    // Our neutral capture position is $60, so it takes the ordinary range.
    if (id == read8(NULL, 0x02a7e4 + setting) && id != 0x64) return 0;
    int start = id == read8(NULL, 0x02a7d2 + setting) ? 0x02a7bf : 0x02a7ac;
    return (read8(NULL, start + setting) + 1) & 0xff;
}

static int actor_oam(void) {
    int allocation = read8(NULL, 0x07f0b4 + ram[0x1692]);
    return read8(NULL, 0x07f000 + allocation + actor_slot);
}

// Sprite processing uses 16-bit absolute data accesses relative to bank 1.
static int run_actor(uint32_t entry, int far_call) {
    Cpu *cpu = cpu_init(NULL, read8, write8, idle);
    cpu_reset(cpu, true);
    cpu->resetWanted = false;
    cpu->x = actor_slot;
    ram[0x15e9] = actor_slot;
    cpu->pc = entry & 0xffff;
    cpu->k = entry >> 16;
    cpu->db = entry >> 16;
    cpu->mf = cpu->xf = true;
    cpu->sp = far_call ? 0x1fc : 0x1fd;
    ram[cpu->sp+1] = 0xff;
    ram[cpu->sp+2] = 0x5f;
    if (far_call) ram[0x1ff] = 0;
    for (int n=0; cpu->pc!=0x6000; n++) {
        if (n==1000000) {
            fprintf(stderr, "Routine %06x did not return at %02x:%04x", entry,cpu->k,cpu->pc);
            cpu_free(cpu);
            return 0;
        }
        cpu_runOpcode(cpu);
    }
    cpu_free(cpu);
    return 1;
}

// The object DMA performed at NMI transfers Yoshi's two 16x16 parts using
// the WRAM pointers prepared by Yoshi's drawing routine (also used by Podoboo).
static void upload_dynamic_tiles(void) {
    for (int part = 0; part <= 4; part++) {
        for (int row = 0; row < 2; row++) {
            int pointer = 0xd85 + row * 10 + part * 2;
            unsigned address = ram[pointer] | (ram[pointer + 1] << 8);
            if (address) memcpy(vram + 0xc000 + row*0x200 + part*64, ram + address, 64);
        }
    }
}

static void clear_oam(void) {
    for(int i=0;i<128;i++){ram[0x201+4*i]=0xf0;ram[0x420+i]=0;}
}
#include "capture-yoshi.h"
#include "capture-pipe-plant.h"
#include "capture-npc.h"
#include "capture-residents.h"

static int capture_player(int character, int form, int frame) {
    int pose = frame & 127;
    clear_oam();
    ram[0x19] = form;
    ram[0xdb3] = character;
    ram[0x13e0] = pose;
    // DrawMarioAndYoshi reads the cape and walking phases independently.
    ram[0x13df] = frame >> 7;
    if (pose <= 2) ram[0x13db] = pose;
    else if (pose >= 4 && pose <= 9) ram[0x13db] = (pose - 4) % 3;
    else ram[0x13db] = 0;
    if (pose >= 17 && pose <= 19) ram[0x13e3] = 6; // left-facing wall run
    ram[0x94] = ram[0x96] = 96;
    ram[0x76] = ram[0x78] = 0;
    memset(ram+0x1a,0,4);
    if(!run_actor(0x00e2ad,1)) return 5;
    upload_dynamic_tiles();
    unsigned small = ram[0xd99] | (ram[0xd9a] << 8);
    if(small) memcpy(vram+0xcfe0,ram+small,32);
    unsigned colors = ram[0xd82] | (ram[0xd83] << 8);
    if(fwrite(ram+0x200,1,0x2a0,stdout)!=0x2a0 || fwrite(vram,1,sizeof vram,stdout)!=sizeof vram) return 4;
    for(int i=0;i<20;i++) putchar(read8(0,colors+i));
    return 0;
}

int main(int argc,char **argv) {
    if((argc<4 || argc>9) || !load(argv[1],rom,sizeof rom)) return 1;
    FILE *state=fopen(argv[2],"rb");
    if(!state || fread(ram,1,sizeof ram,state)!=sizeof ram || fread(vram,1,sizeof vram,state)!=sizeof vram) return 2;
    fclose(state);
    ram[0x64]=0x20; // SpriteProperties during normal level play.
    if (argc >= 6 && (!strcmp(argv[3], "resident") || !strcmp(argv[3], "npc")))
        actor_slot = capture_slot(atoi(argv[4]));
    if (argc == 9 && !strcmp(argv[3], "npc"))
        return capture_npc(atoi(argv[4]), argv[5], atoi(argv[6]), atoi(argv[7]), atoi(argv[8]));
    if (argc == 6 && !strcmp(argv[3], "resident")) return capture_resident(atoi(argv[4]), atoi(argv[5]));
    if(argc==6) return capture_player(atoi(argv[3]),atoi(argv[4]),atoi(argv[5]));
    if(argc!=4 && argc!=5) return 3;
    int id=atoi(argv[3]);
    int stomped=argc==5 && strcmp(argv[4], "stomped")==0;
    if(argc==5 && (!stomped || (id!=0xab && id!=0xa2))) return 3;
    if(id<0 || id>200) return 3;
    actor_slot = capture_slot(id);
    memset(ram+0x14c8,0,12);
    ram[0x0100]=0x14;
    ram[0x9e + actor_slot]=id; ram[0x14c8 + actor_slot]=1; ram[0xe4 + actor_slot]=96;ram[0xd8 + actor_slot]=96;
    ram[0x94]=32;ram[0x96]=96;
    if (!run_actor(0x7f7d2,1)) return 5; // InitSpriteTables
    // Direct draw routines bypass 01:80D2, which assigns this OAM base.
    ram[0x15ea + actor_slot] = actor_oam();
    if (id == 0x35) return capture_yoshi();
    if (id == 0x1a || id == 0x2a || id == 0x4f || id == 0x50) return capture_pipe_plant(id);
    // The first pass runs INIT (and for some sprites several setup frames).
    // Keep those one-time empty OAM slots out of the repeating active cycle.
    for(int elapsed=0;elapsed<64;elapsed++){
        int frame=elapsed & 31;
        clear_oam();
        ram[0x13]=ram[0x14]=frame;
        ram[0xe4 + actor_slot]=96;ram[0xd8 + actor_slot]=96;ram[0x14e0 + actor_slot]=ram[0x14d4 + actor_slot]=0;
        ram[0x1a]=ram[0x1b]=ram[0x1c]=ram[0x1d]=0;
        if (stomped && elapsed) {
            if (id==0xab) ram[0xc2 + actor_slot]=1;    // Rex walks compressed after one stomp.
            if (id==0xa2) ram[0x1540 + actor_slot]=128; // Mechakoopa's native inactive pose.
        }
        if (id==0x54 && elapsed) {
            // ClimbingDoor draws only while its punch-triggered timer is live.
            ram[0x1540 + actor_slot] = frame < 30 ? 31-frame : 1;
            ram[0x9d] = 1;  // drive the countdown explicitly
        }
        if (id==0x1f || id==0x20) {
            // Capture the visible wand-casting state and the projectile at rest.
            // The caster's waiting/teleport phase has no OAM.
            ram[0x14c8 + actor_slot] = 8;
            ram[0xc2 + actor_slot] = 2;
            ram[0x1540 + actor_slot] = frame>12 ? 0x32 : 0x68;
            ram[0x9d] = id==0x20;
            if (!run_actor(id==0x1f ? 0x01be75 : 0x01808c, id!=0x1f)) return 5;
        } else if (id==0x33 || id==0x5b || id==0x5d || id==0xa4 || id==0x9b || id==0x79) {
            // Podoboo and water platforms require a native liquid spawn point;
            // a hammer brother normally depends on a second flying platform.
            // Invoke their original draw functions in an active sprite slot.
            ram[0x14c8 + actor_slot] = 8;
            ram[0x9d] = 1;
            ram[0x1602 + actor_slot] = frame>12;
            uint32_t address = id==0x33 ? 0x01e1a6 : id==0x9b ? 0x02dafd : id==0x79 ? 0x01c18a : 0x01b655;
            if(!run_actor(address,0)) return 5;
        } else if (!run_actor(0x01808c,1)) return 5;
        upload_dynamic_tiles();
        if(elapsed < 32) continue;
        if(fwrite(ram+0x200,1,0x2a0,stdout)!=0x2a0 || fwrite(vram,1,sizeof vram,stdout)!=sizeof vram) return 4;
    }
    return 0;
}
