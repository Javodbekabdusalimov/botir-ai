// SSRF-safe page fetch: http(s) on default ports, public IPs only, the checked IP is the one we connect to.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { SourceError } from './text-utils';

export interface ResolvedIp {
  address: string;
  family: number;
}
export type Resolver = (host: string) => Promise<ResolvedIp[]>;

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

const BAD_URL = "Havola noto'g'ri. To'liq manzil kiriting: https://sayt.uz";
const NOT_PUBLIC = 'Sayt topilmadi yoki ochiq internetda emas';
const UNREACHABLE = "Sayt javob bermadi. Manzilni tekshiring yoki matnni nusxalab yuboring";

const blockedV4 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(net, prefix, 'ipv4');

// IPv6: only global unicast (2000::/3) is allowed, so ::1, ::ffff:a.b.c.d, 64:ff9b::, fc00::, fe80::, ff00:: are all refused.
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [net, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blockedV6.addSubnet(net, prefix, 'ipv6');

/** True unless `ip` is a public unicast address. */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blockedV4.check(ip, 'ipv4');
  if (family === 6) return ip.includes('%') || !globalV6.check(ip, 'ipv6') || blockedV6.check(ip, 'ipv6');
  return true;
}

const hostOf = (u: URL): string => u.hostname.replace(/^\[|\]$/g, '');

/** Syntax-level checks (no DNS). WHATWG URL already turns 2130706433 / 0x7f.1 / 127.1 into 127.0.0.1. */
export function parsePublicUrl(raw: unknown, base?: URL): URL {
  if (typeof raw !== 'string' || raw.length > 2000) throw new SourceError(BAD_URL);
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    throw new SourceError(BAD_URL);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SourceError(BAD_URL);
  if (url.username || url.password) throw new SourceError(BAD_URL);
  if (url.port && url.port !== '80' && url.port !== '443') throw new SourceError(NOT_PUBLIC);
  const host = hostOf(url);
  if (isIP(host) ? isBlockedIp(host) : !host.includes('.') || /(^|\.)(localhost|local|internal|localdomain|home\.arpa)\.?$/i.test(host)) {
    throw new SourceError(NOT_PUBLIC);
  }
  return url;
}

const systemResolver: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Resolves once; every address must be public (one private record rejects the host). Returns the IP to connect to. */
export async function resolvePublic(url: URL, resolver: Resolver = systemResolver): Promise<ResolvedIp> {
  const host = hostOf(url);
  const family = isIP(host);
  const ips = family ? [{ address: host, family }] : await resolver(host).catch(() => []);
  const first = ips[0];
  if (!first || ips.some((ip) => isBlockedIp(ip.address))) throw new SourceError(NOT_PUBLIC);
  return ips.find((ip) => ip.family === 4) ?? first;
}

function open(url: URL, ip: ResolvedIp, signal: AbortSignal): Promise<IncomingMessage> {
  // Pin the checked IP: DNS is not asked again, so it cannot rebind between check and connect.
  const pinned: LookupFunction = (_host, opts, cb) =>
    opts.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        agent: false, signal, lookup: pinned,
        headers: { 'user-agent': 'BotirAI/1.0 (business page import)', accept: 'text/html', 'accept-encoding': 'identity' },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

async function readBody(res: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new SourceError('Sahifa juda katta (2 MB dan oshmasin)');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function decode(body: Buffer, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString('utf8');
  }
}

/** Anonymous GET of one public HTML page. Every redirect hop is re-validated and re-pinned. */
export async function fetchPublicHtml(raw: string, resolver?: Resolver): Promise<{ html: string; finalUrl: URL }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const expired = new Promise<never>((_r, reject) => signal.addEventListener('abort', () => reject(new SourceError(UNREACHABLE)), { once: true }));
  return Promise.race([fetchHops(parsePublicUrl(raw), signal, resolver), expired]);
}

async function fetchHops(start: URL, signal: AbortSignal, resolver?: Resolver): Promise<{ html: string; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ip = await resolvePublic(url, resolver);
    const res = await open(url, ip, signal).catch(() => {
      throw new SourceError(UNREACHABLE);
    });
    try {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        url = parsePublicUrl(res.headers.location, url);
        continue;
      }
      if (status < 200 || status >= 300) throw new SourceError(`Sayt sahifani bermadi (HTTP ${status}). Matnni nusxalab yoki skrinshot yuboring`);
      const type = String(res.headers['content-type'] ?? '');
      if (!/^\s*text\/html\b/i.test(type)) throw new SourceError('Bu havola oddiy veb-sahifa emas');
      const encoding = res.headers['content-encoding'];
      if (encoding && encoding !== 'identity') throw new SourceError(UNREACHABLE);
      const body = await readBody(res).catch((e: unknown) => {
        throw e instanceof SourceError ? e : new SourceError(UNREACHABLE);
      });
      return { html: decode(body, type), finalUrl: url };
    } finally {
      res.destroy();
    }
  }
  throw new SourceError("Sayt juda ko'p marta boshqa manzilga yo'naltirdi");
}
