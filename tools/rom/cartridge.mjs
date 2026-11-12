import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const expectedSha256 = '5cc54b1e5c8d3c7701a5e20514145c3b36f15f26fe0a4fe6d2e43677e4b4eda9';

export class Cartridge {
  constructor(path) {
    const bytes = readFileSync(path);
    this.data = bytes.length === 524800 ? bytes.subarray(512) : bytes;
    const digest = createHash('sha256').update(this.data).digest('hex');
    if (digest !== expectedSha256) throw new Error('ROM differs from the verified Europe revision 1 payload');
    const checksum = this.data.reduce((sum, b) => (sum + b) & 65535, 0);
    if (checksum !== this.data.readUInt16LE(0x7fde) || (checksum ^ this.data.readUInt16LE(0x7fdc)) !== 65535)
      throw new Error('Cartridge checksum mismatch');
  }
  offset(address) {
    if ((address & 0xffff) < 0x8000) throw new Error('Unmapped LoROM address 0x' + address.toString(16));
    return ((address >>> 16) & 15) * 0x8000 + (address & 0x7fff);
  }
  byte(address) {
    return this.data[this.offset(address)];
  }
  word(address) {
    return this.data.readUInt16LE(this.offset(address));
  }
  long(address) {
    return this.data.readUIntLE(this.offset(address), 3);
  }
}
