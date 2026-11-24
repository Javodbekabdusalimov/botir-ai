import { Logger } from '@nestjs/common';

// Render free plan sleeps a service after ~15 min without inbound HTTP traffic.
// GitHub Actions cron proved unreliable (scheduled runs skipped), so on Render the
// API pings its own public URL and the web app every 10 minutes through Render's proxy.
const INTERVAL_MS = 10 * 60 * 1000;

export function startKeepWarm(): void {
  if (!process.env.RENDER || process.env.KEEP_WARM === 'off') return;
  const self = process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_API_URL;
  const web = process.env.WEB_URL;
  const urls = [self && `${self.replace(/\/$/, '')}/health`, web && `${web.replace(/\/$/, '')}/robots.txt`].filter(
    (u): u is string => Boolean(u),
  );
  if (urls.length === 0) return;
  const log = new Logger('KeepWarm');
  const ping = (): void => {
    for (const url of urls) {
      fetch(url, { signal: AbortSignal.timeout(120_000) })
        .then((r) => { if (!r.ok) log.warn(`${r.status} ${url}`); })
        .catch((e: unknown) => log.warn(`${url}: ${e instanceof Error ? e.message : String(e)}`));
    }
  };
  setInterval(ping, INTERVAL_MS).unref();
  log.log(`pinging every 10 min: ${urls.join(', ')}`);
}
