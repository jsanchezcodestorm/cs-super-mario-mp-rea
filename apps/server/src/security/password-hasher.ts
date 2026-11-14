import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

const keyLength = 64;
const saltLength = 16;
const costLog2 = 15;
const blockSize = 8;
const parallelization = 3;
const maximumMemory = 64 * 1024 * 1024;

export function validatePassword(value: unknown, minimumCharacters = 12) {
  if (typeof value !== 'string') throw new BadRequestException('Password non valida.');
  const length = Array.from(value).length;
  if (length < minimumCharacters || length > 128)
    throw new BadRequestException(`La password deve contenere da ${minimumCharacters} a 128 caratteri.`);
  return value;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(saltLength);
  const key = await derive(password, salt, costLog2, blockSize, parallelization);
  return `$scrypt$ln=${costLog2},r=${blockSize},p=${parallelization}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const match = /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(encoded);
  if (!match) return false;
  const [, logText, blockText, parallelText, saltText, keyText] = match;
  const logCost = Number(logText);
  const r = Number(blockText);
  const p = Number(parallelText);
  if (!Number.isInteger(logCost) || logCost < 13 || logCost > 17 || r !== 8 || !Number.isInteger(p) || p < 1 || p > 5)
    return false;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(keyText, 'base64url');
  if (salt.length !== saltLength || expected.length !== keyLength) return false;
  const actual = await derive(password, salt, logCost, r, p);
  return timingSafeEqual(actual, expected);
}

function derive(password: string, salt: Buffer, logCost: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, {
      N: 2 ** logCost,
      r,
      p,
      maxmem: Math.max(maximumMemory, 128 * (2 ** logCost) * r + maximumMemory),
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
