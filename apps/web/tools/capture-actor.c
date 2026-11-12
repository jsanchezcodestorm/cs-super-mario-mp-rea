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

// Sprite processing uses 16-bit absolute data accesses relative to bank 1.
static int run_actor(uint32_t entry, int far_call) {
    Cpu *cpu = cpu_init(NULL, read8, write8, idle);
    cpu_reset(cpu, true);
    cpu->resetWanted = false;
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
static int capture_player(int character,int form,int pose) {
    clear_oam();
    ram[0x19] = form;
    ram[0xdb3] = character;
    ram[0x13e0] = pose;
    ram[0x13df] = pose%3;
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
    if((argc!=4 && argc!=6) || !load(argv[1],rom,sizeof rom)) return 1;
    FILE *state=fopen(argv[2],"rb");
    if(!state || fread(ram,1,sizeof ram,state)!=sizeof ram || fread(vram,1,sizeof vram,state)!=sizeof vram) return 2;
    fclose(state);
    if(argc==6) return capture_player(atoi(argv[3]),atoi(argv[4]),atoi(argv[5]));
    int id=atoi(argv[3]);
    if(id<0 || id>200) return 3;
    memset(ram+0x14c8,0,12);
    ram[0x0100]=0x14;
    ram[0x9e]=id; ram[0x14c8]=1; ram[0xe4]=96;ram[0xd8]=96;
    ram[0x94]=32;ram[0x96]=96;
    ram[0x64]=0x20;
    if (!run_actor(0x7f7d2,1)) return 5; // InitSpriteTables, X=slot zero
    // Sample one 32-frame window of the PAL counter; Yoshi keeps its four
    // authored idle/tongue poses from the dedicated path.
    for(int frame=0;frame<(id==0x35?24:32);frame++){
        for(int i=0;i<128;i++){ram[0x201+4*i]=0xf0;ram[0x420+i]=0;}
        ram[0x13]=ram[0x14]=frame;
        ram[0xe4]=96;ram[0xd8]=96;ram[0x14e0]=ram[0x14d4]=0;
        ram[0x1a]=ram[0x1b]=ram[0x1c]=ram[0x1d]=0;
        if (id==0x1f || id==0x20) {
            // Capture the visible wand-casting state and the projectile at rest.
            // The caster's waiting/teleport phase has no OAM.
            ram[0x14c8] = 8;
            ram[0xc2] = 2;
            ram[0x1540] = frame>12 ? 0x32 : 0x68;
            ram[0x9d] = id==0x20;
            if (!run_actor(id==0x1f ? 0x01be75 : 0x01808c, id!=0x1f)) return 5;
        } else if (id==0x35) {
            ram[0x157c] = 1; // face left
            ram[0x1602] = frame==22 ? 7 : frame==23 ? 8 : frame>12 ? 1 : 0;
            ram[0x15f6] = 0x0a;
            if (!run_actor(0x1ee61,0)) return 5; // HandleOffYoshi, original drawing and DMA setup
        } else if (id==0x33 || id==0x5b || id==0x5d || id==0xa4 || id==0x9b || id==0x79) {
            // Podoboo and water platforms require a native liquid spawn point;
            // a hammer brother normally depends on a second flying platform.
            // Invoke their original draw functions in an active sprite slot.
            ram[0x14c8] = 8;
            ram[0x9d] = 1;
            ram[0x1602] = frame>12;
            uint32_t address = id==0x33 ? 0x01e1a6 : id==0x9b ? 0x02dafd : id==0x79 ? 0x01c18a : 0x01b655;
            if(!run_actor(address,0)) return 5;
        } else if (!run_actor(0x01808c,1)) return 5;
        if((id==0x35 && (frame==5 || frame>=21)) || id!=0x35) {
            upload_dynamic_tiles();
            if(fwrite(ram+0x200,1,0x2a0,stdout)!=0x2a0 || fwrite(vram,1,sizeof vram,stdout)!=sizeof vram) return 4;
        }
    }
    return 0;
}
