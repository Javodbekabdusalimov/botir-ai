// Run: pnpm exec tsx apps/api/src/knowledge/text-utils.test.ts
import { strict as assert } from 'node:assert';
import { htmlToText, normalizeName, parseSom, redactPii, sameItemName, somAmounts } from './text-utils';

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

// parseSom: every usual way an owner types 45 000
for (const v of [45000, '45000', '45.000', '45 000', '45,000', "45,000 so'm", '45 000 so‘m', '45 ming', '45ming', '45 ming so\'m', '45k', ' 45\u00a0000 ', '45 000 сум', '45000 UZS', '45000.00']) {
  assert.equal(parseSom(v), 45000, String(v));
}
assert.equal(parseSom('1.250.000'), 1_250_000);
assert.equal(parseSom('1 250 000 so\'m'), 1_250_000);
assert.equal(parseSom('45.5 ming'), 45_500);
assert.equal(parseSom('1,5 mln'), 1_500_000);
assert.equal(parseSom('0'), 0);
for (const v of ['', 'abc', '-45000', '45.5', '12.50', '45 000 000 000', 3e9, 1.5, -1, NaN, null, undefined, {}, '45 00', '4 5000']) {
  assert.equal(parseSom(v), null, String(v));
}

// somAmounts: what a quote can mean (price grounding)
assert.ok(somAmounts('Osh 45 000').has(45000) && !somAmounts('Osh 45 000').has(4500) && !somAmounts('Osh 45 000').has(0));
assert.ok(somAmounts('Osh 45 ming').has(45000) && somAmounts('Choy 5k').has(5000) && somAmounts('Paket 1,5 mln').has(1_500_000));
const list = somAmounts('100 000 200 000');
assert.ok(list.has(100000) && list.has(200000));
assert.ok(somAmounts('Cola 1.5 l 15 000').has(15000) && !somAmounts('Go‘sht 1 kg 90 000').has(1000));

// sameItemName: spelling, order, brackets, suffixes; never a different size, number or extra word
for (const [a, b] of [
  ["Lavash go'shtli (kichik)", "Lavash kichik go‘shti"], ['Coca-Cola 1.5L', 'coca cola 1,5 l'], ["Choy ko'k", "Ko‘k choy"], ['Osh', 'OSH!'],
]) assert.ok(sameItemName(a, b), `${a} = ${b}`);
for (const [a, b] of [
  ['Cola 0.5 l', 'Cola 1.5 l'], ['Osh 1', 'Osh 2'], ['Lavash kichik', 'Lavash tovuq kichik'], ["Lavash go'shtli", "Lavash go'shtsiz"],
  ['Lavash katta', 'Lavash kichik'], ["Lavash mol go'shti kichik", "Lavash go'shtli (kichik)"],
]) assert.ok(!sameItemName(a, b), `${a} ≠ ${b}`);

process.stdout.write('text-utils.test: OK\n');
