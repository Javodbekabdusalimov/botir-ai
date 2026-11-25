// Run: pnpm exec tsx apps/api/src/telegram-bot/mini-app.test.ts  (pure, no network)
import { strict as assert } from 'node:assert';
import { miniAppOrigin, miniAppUrl, renderReply } from './bot';

const WEB = 'https://ai-assistant-f16u.onrender.com/';

// Origin: only a bare https origin is usable for web_app buttons.
assert.equal(miniAppOrigin(WEB), 'https://ai-assistant-f16u.onrender.com');
for (const bad of [undefined, '', 'http://localhost:3000', 'https://x.uz/path', 'javascript:alert(1)']) assert.equal(miniAppOrigin(bad), null);

// URL: `${WEB_URL}/tg?to=<internal path>`, internal paths only.
assert.equal(miniAppUrl('https://a.uz'), 'https://a.uz/tg');
assert.equal(miniAppUrl('https://a.uz', '/live/abc-1'), 'https://a.uz/tg?to=%2Flive%2Fabc-1');
assert.equal(new URL(miniAppUrl('https://a.uz', '/live/abc-1')).searchParams.get('to'), '/live/abc-1');
for (const bad of ['//evil.com', 'https://evil.com', 'live/x', '/x y', '/<script>']) assert.throws(() => miniAppUrl('https://a.uz', bad), bad);

// Reply: web_app keyboard with https; plain text link otherwise; strings unchanged.
{
  const r = renderReply({ text: 'Qabul qildim!', webApp: { label: '👀 Jonli kuzatish', path: '/live/n1' } }, WEB);
  assert.equal(r.text, 'Qabul qildim!');
  const button = r.reply_markup?.inline_keyboard[0]?.[0] as { text: string; web_app?: { url: string } } | undefined;
  assert.equal(button?.text, '👀 Jonli kuzatish');
  assert.equal(button?.web_app?.url, 'https://ai-assistant-f16u.onrender.com/tg?to=%2Flive%2Fn1');
}
{
  const r = renderReply({ text: 'Qabul qildim!', webApp: { label: 'x', path: '/live/n1' } }, 'http://localhost:3000');
  assert.equal(r.reply_markup, undefined);
  assert.equal(r.text, 'Qabul qildim!\nhttp://localhost:3000/live/n1');
}
assert.deepEqual(renderReply('salom', WEB), { text: 'salom' });

console.log('mini-app: OK');
