// Run: pnpm exec tsx apps/api/src/knowledge/text-utils.test.ts
import { strict as assert } from 'node:assert';
import { htmlToText, normalizeName, redactPii } from './text-utils';

// Phones, cards, emails go away in every usual spelling
for (const phone of [
  '+998901234567', '+998 90 123 45 67', '+998 (90) 123-45-67', '998901234567', '90 123 45 67', '90-123-45-67', '(90) 123 45 67', '901234567', '91.123.45.67',
  '+7 916 123-45-67', '8 90 123 45 67', '+１９９８９０１２３４５６７',
]) assert.equal(redactPii(`tel ${phone} ok`), 'tel [telefon] ok', phone);
for (const card of ['8600123412341234', '8600 1234 1234 1234', '9860-1234-1234-1234', '4111 1111 1111 1111']) {
  assert.equal(redactPii(`karta ${card}!`), 'karta [karta]!', card);
}
assert.equal(redactPii('yozing: ali.vali+1@mail.uz, rahmat'), 'yozing: [email], rahmat');
assert.equal(redactPii('a@b.uz 90 123 45 67, 8600 1234 1234 1234'), '[email] [telefon], [karta]');

// Prices, hours, quantities stay
for (const s of [
  "Osh 45 000 so'm", '1 250 000', '270000', '150 000 000', '150000000', '100 000 200 000 300 000 400 000', '09:00-21:00', '20 000-25 000', '90 000 95 000', '2026-11-25',
  '10 kg, 12 dona', '50 000 60 000 70 000',
]) assert.equal(redactPii(s), s, s);

assert.equal(normalizeName("  O‘zbek   OSHI! "), normalizeName("o'zbek oshi"));
assert.notEqual(normalizeName('Osh 1'), normalizeName('Osh 2'));

assert.equal(
  htmlToText('<html><head><title>Kafe</title><meta property="og:description" content="Eng mazali osh"><style>x{}</style></head>' +
    '<body><!-- maxfiy <b> --><script>alert("<p>")</script><h1>Menyu</h1><p>Osh&nbsp;<b>45&#32;000</b> so&#39;m &amp; choy</p></body></html>'),
  "Kafe\nEng mazali osh\nMenyu\nOsh 45 000 so'm & choy",
);
// Untrusted 2 MB of unclosed tags stays linear
for (const bomb of ['<script>', '<!--', '<a ', '<meta name="description" ', '&#x']) {
  const started = Date.now();
  htmlToText(bomb.repeat(Math.floor((2 * 1024 * 1024) / bomb.length)));
  assert.ok(Date.now() - started < 3000, `slow on ${bomb}`);
}
for (const bomb of ['9', '90 ', '+9', 'a@', 'a.', '(((', '+998   ']) {
  const started = Date.now();
  redactPii(bomb.repeat(Math.floor(200_000 / bomb.length)));
  assert.ok(Date.now() - started < 3000, `slow redact on ${bomb}`);
}

process.stdout.write('text-utils.test: OK\n');
