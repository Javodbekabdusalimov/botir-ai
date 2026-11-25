// Uploaded files: real type by magic bytes (the client's mimetype is only a hint), optional audio → text.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LlmAttachment } from '../agents';
import { SourceError } from './text-utils';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type SniffedFile = { kind: 'photo' | 'pdf'; mediaType: LlmAttachment['mediaType'] } | { kind: 'voice'; ext: string };

const ascii = (b: Buffer, from: number, to: number): string => b.subarray(from, to).toString('latin1');

export function sniffFile(b: Buffer, mimetype: string): SniffedFile | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'photo', mediaType: 'image/jpeg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'photo', mediaType: 'image/png' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { kind: 'photo', mediaType: 'image/webp' };
  if (ascii(b, 0, 5) === '%PDF-') return { kind: 'pdf', mediaType: 'application/pdf' };
  // Containers below can also hold video, so the declared type must say audio as well.
  if (!mimetype.startsWith('audio/')) return null;
  if (ascii(b, 0, 4) === 'OggS') return { kind: 'voice', ext: 'ogg' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return { kind: 'voice', ext: 'wav' };
  if (ascii(b, 4, 8) === 'ftyp') return { kind: 'voice', ext: 'm4a' };
  if (b.readUInt32BE(0) === 0x1a45dfa3) return { kind: 'voice', ext: 'webm' };
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe6) === 0xe2)) return { kind: 'voice', ext: 'mp3' };
  return null;
}

/** STT_CMD = path of an executable that gets the audio file path and prints the transcript. Never goes through a shell. */
export const sttCommand = (): string => process.env.STT_CMD?.trim() ?? '';

export async function transcribe(audio: Buffer, ext: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'botir-stt-'));
  try {
    const file = join(dir, `audio.${ext}`);
    await writeFile(file, audio, { mode: 0o600 });
    return await new Promise<string>((resolve, reject) => {
      execFile(sttCommand(), [file], { timeout: 180_000, maxBuffer: 1024 * 1024 }, (err, stdout) =>
        err ? reject(new SourceError("Ovozni matnga o'girib bo'lmadi. Brauzerda diktovka qiling yoki matn yozing")) : resolve(stdout.trim()));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
