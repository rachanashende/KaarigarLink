/**
 * M12 document storage abstraction. Development uses the local disk under
 * FILE_STORAGE_DIR (default backend/storage/uploads, never served statically).
 * A cloud backend can implement the same interface later.
 *
 * Keys are generated here ("YYYY/MM/<uuid>") and validated before every access;
 * client filenames or paths are never used to build a filesystem path.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env';

export interface StorageBackend {
  put(key: string, contents: Buffer): Promise<void>;
  open(key: string): Promise<Readable | null>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function newStorageKey(now = new Date()): string {
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
}

class LocalDiskStorage implements StorageBackend {
  private readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  /** Resolves a validated key inside the root; anything else is rejected. */
  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, ...key.split('/'));
    if (!full.startsWith(this.root + path.sep)) throw new Error('Storage key escapes the storage root');
    return full;
  }
  async put(key: string, contents: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    // wx: never overwrite an existing object.
    await fs.writeFile(full, contents, { flag: 'wx' });
  }
  async open(key: string) {
    const full = this.resolve(key);
    try {
      await fs.access(full);
    } catch {
      return null;
    }
    return createReadStream(full);
  }
  async remove(key: string) {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

/** Relative FILE_STORAGE_DIR values are resolved from the backend's working directory. */
export const storage: StorageBackend = new LocalDiskStorage(env.FILE_STORAGE_DIR);
