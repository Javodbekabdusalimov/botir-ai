// Run: pnpm exec tsx apps/api/src/knowledge/url-guard.test.ts  (no network, fake DNS)
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchPublicHtml, isBlockedIp, parsePublicUrl, resolvePublic, type Resolver } from './url-guard';

const v4 = (address: string) => ({ address, family: 4 });
const dns = (...ips: string[]): Resolver => async () => ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

async function main(): Promise<void> {
  for (const ip of [
    '127.0.0.1', '127.8.8.8', '0.0.0.0', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.254',
    '192.0.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::7f00:1', 'fc00::1',
    'fd00:ec2::254', 'fe80::1', 'fe80::1%en0', 'ff02::1', '2002:7f00:1::', '2001::1', '2001:db8::1', 'not-an-ip', '',
  ]) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '192.169.0.1', '2606:4700::1111', '2a00:1450:4001:81b::200e']) {
    assert.equal(isBlockedIp(ip), false, ip);
  }

  for (const url of [
    'file:///etc/passwd', 'ftp://example.com', 'gopher://example.com', 'javascript:alert(1)', 'not a url', '', 'http://user:pw@example.com',
    'http://localhost', 'http://LOCALHOST.', 'http://api.localhost', 'http://intranet', 'http://metadata.google.internal', 'http://printer.local',
    'http://127.0.0.1', 'http://127.1', 'http://2130706433', 'http://0x7f.0.0.1', 'http://0177.0.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]',
    'http://169.254.169.254/latest/meta-data', 'http://example.com:8080', 'http://example.com:22', 42, null, `https://example.com/${'a'.repeat(2100)}`,
  ]) assert.throws(() => parsePublicUrl(url), `must reject ${String(url).slice(0, 60)}`);
  assert.equal(parsePublicUrl(' https://example.com/menu?x=1 ').href, 'https://example.com/menu?x=1');
  assert.throws(() => parsePublicUrl('//10.0.0.1/x', new URL('https://example.com')), 'relative redirect to a private host');

  const url = new URL('https://shop.example');
  assert.deepEqual(await resolvePublic(url, dns('93.184.216.34')), v4('93.184.216.34'));
  await assert.rejects(resolvePublic(url, dns('10.0.0.5')), 'private DNS answer');
  await assert.rejects(resolvePublic(url, dns('93.184.216.34', '127.0.0.1')), 'one private record is enough');
  await assert.rejects(resolvePublic(url, dns('93.184.216.34', '::1')));
  await assert.rejects(resolvePublic(url, dns()), 'no records');
  await assert.rejects(resolvePublic(url, async () => { throw new Error('NXDOMAIN'); }));

  // End to end: a public-looking name that resolves to a live loopback server must never reach it.
  let hits = 0;
  const server = createServer((_q, res) => { hits += 1; res.end('secret'); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  await assert.rejects(fetchPublicHtml('http://rebind.example/', dns('127.0.0.1')));
  await assert.rejects(fetchPublicHtml(`http://127.0.0.1:${port}/`));
  assert.equal(hits, 0, 'loopback was not contacted');
  server.close();

  process.stdout.write('url-guard.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`url-guard.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
