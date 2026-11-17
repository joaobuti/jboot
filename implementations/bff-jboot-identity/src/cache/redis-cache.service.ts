import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Socket, createConnection } from 'node:net';
import { AppConfigService } from '../config/app-config.service';

type RedisValue = string | null;

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly url: URL;
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private readonly pending: Array<{
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(config: AppConfigService) {
    this.url = new URL(config.redisUrl);
  }

  async get(key: string): Promise<RedisValue> {
    const value = await this.command(['GET', key]);
    return typeof value === 'string' ? value : null;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.command(['SETEX', key, String(ttlSeconds), value]);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    const value = await this.command(['DEL', ...keys]);
    return typeof value === 'number' ? value : 0;
  }

  async scan(pattern: string, count = 100): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const response = await this.command(['SCAN', cursor, 'MATCH', pattern, 'COUNT', String(count)]);
      if (!Array.isArray(response) || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
        return keys;
      }
      cursor = response[0];
      keys.push(...response[1].filter((item): item is string => typeof item === 'string'));
    } while (cursor !== '0');
    return keys;
  }

  private command(args: string[]): Promise<unknown> {
    this.chain = this.chain.then(() => this.execute(args), () => this.execute(args));
    return this.chain;
  }

  private async execute(args: string[]): Promise<unknown> {
    const socket = await this.connect();
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      socket.write(this.serialize(args), (error) => {
        if (error) {
          this.pending.shift();
          reject(error);
        }
      });
    });
  }

  private connect(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) {
      return Promise.resolve(this.socket);
    }

    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.url.hostname,
        port: Number(this.url.port || 6379)
      });

      socket.on('data', (chunk) => this.onData(chunk));
      socket.on('error', (error) => {
        this.logger.warn(`Redis connection error: ${error.message}`);
        this.rejectPending(error);
      });
      socket.on('close', () => {
        this.socket = null;
      });
      socket.once('connect', () => {
        this.socket = socket;
        resolve(socket);
      });
      socket.once('error', reject);
    });
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.pending.length > 0) {
      const parsed = this.parse(0);
      if (!parsed) {
        return;
      }
      this.buffer = this.buffer.subarray(parsed.offset);
      const pending = this.pending.shift();
      if (!pending) {
        return;
      }
      if (parsed.value instanceof Error) {
        pending.reject(parsed.value);
      } else {
        pending.resolve(parsed.value);
      }
    }
  }

  private serialize(args: string[]): string {
    return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join('')}`;
  }

  private parse(offset: number): { value: unknown; offset: number } | null {
    const prefix = this.buffer.toString('utf8', offset, offset + 1);
    if (!prefix) {
      return null;
    }
    if (prefix === '+') {
      return this.parseLine(offset, (line) => line);
    }
    if (prefix === '-') {
      return this.parseLine(offset, (line) => new Error(line));
    }
    if (prefix === ':') {
      return this.parseLine(offset, (line) => Number(line));
    }
    if (prefix === '$') {
      return this.parseBulk(offset);
    }
    if (prefix === '*') {
      return this.parseArray(offset);
    }
    return { value: new Error('Invalid Redis response'), offset: this.buffer.length };
  }

  private parseLine(offset: number, mapper: (line: string) => unknown) {
    const end = this.buffer.indexOf('\r\n', offset);
    if (end === -1) {
      return null;
    }
    return { value: mapper(this.buffer.toString('utf8', offset + 1, end)), offset: end + 2 };
  }

  private parseBulk(offset: number): { value: RedisValue; offset: number } | null {
    const end = this.buffer.indexOf('\r\n', offset);
    if (end === -1) {
      return null;
    }
    const length = Number(this.buffer.toString('utf8', offset + 1, end));
    if (length === -1) {
      return { value: null, offset: end + 2 };
    }
    const start = end + 2;
    const nextOffset = start + length + 2;
    if (this.buffer.length < nextOffset) {
      return null;
    }
    return { value: this.buffer.toString('utf8', start, start + length), offset: nextOffset };
  }

  private parseArray(offset: number): { value: unknown[]; offset: number } | null {
    const end = this.buffer.indexOf('\r\n', offset);
    if (end === -1) {
      return null;
    }
    const length = Number(this.buffer.toString('utf8', offset + 1, end));
    const values: unknown[] = [];
    let currentOffset = end + 2;
    for (let index = 0; index < length; index += 1) {
      const parsed = this.parse(currentOffset);
      if (!parsed) {
        return null;
      }
      values.push(parsed.value);
      currentOffset = parsed.offset;
    }
    return { value: values, offset: currentOffset };
  }

  private rejectPending(error: Error) {
    while (this.pending.length > 0) {
      this.pending.shift()?.reject(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.socket?.end();
  }
}
