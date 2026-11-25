// Run: pnpm exec tsx apps/api/src/knowledge/fact-validation.test.ts
import { strict as assert } from 'node:assert';
import { LlmClient, MemoryStore } from '../agents';
import { KnowledgeExtractor } from './extractor';
import { dropKnown, factKey, isValidPrice, LIMITS, validateFacts } from './fact-validation';
import { sniffFile } from './upload';

const cat = (over: Record<string, unknown> = {}) => ({ kind: 'catalog', topic: 'Osh', content: 'Osh, 1 porsiya', price: 45000, unit: 'porsiya', confidence: 0.9, ...over });
const one = (raw: Record<string, unknown>, text?: string) => validateFacts({ facts: [raw] }, text)[0];

async function main(): Promise<void> {
  // Prices: finite integer >= 0 or the fact is dropped
  for (const price of [-1, 1.5, NaN, Infinity, '45000', null, undefined, 3e9, true, {}]) assert.equal(one(cat({ price })), undefined, String(price));
  assert.equal(one(cat({ price: 0 }))?.price, 0);
  assert.equal(isValidPrice(45000), true);

  // Shape
  for (const bad of [null, [], 'x', { facts: 'x' }, {}]) assert.deepEqual(validateFacts(bad), []);
  for (const bad of [null, 'x', 1, [], { ...cat(), kind: 'admin' }, cat({ topic: ' ' }), { kind: 'faq', topic: 'delivery', content: 'Ha' }, { kind: 'policy', topic: 'delivery', content: '' }]) {
    assert.deepEqual(validateFacts({ facts: [bad] }), []);
  }

  // Clamps, one line, extra keys ignored (status cannot be injected)
  const long = one({ ...cat({ topic: 'a'.repeat(500), unit: 'b'.repeat(500), content: `x\n\u0000${'c'.repeat(5000)}`, confidence: 9 }), status: 'confirmed', businessId: 'other' });
  assert.ok(long);
  assert.equal(long.topic.length, LIMITS.topic);
  assert.equal(long.unit?.length, LIMITS.unit);
  assert.equal(long.content.length, LIMITS.content);
  assert.ok(!/[\n\u0000]/.test(long.content));
  assert.equal(long.confidence, 1);
  assert.ok(!('status' in long) && !('businessId' in long));
  assert.equal(one(cat({ confidence: 'high' }))?.confidence, 0.5);
  const policy = one({ kind: 'policy', topic: 'Delivery', content: 'Bepul', price: 5, unit: 'x', question: 'q' });
  assert.deepEqual([policy?.topic, policy?.price, policy?.unit, policy?.question], ['delivery', null, null, null]);
  assert.equal(validateFacts({ facts: Array.from({ length: 500 }, (_, i) => cat({ topic: `Item ${i}` })) }).length, LIMITS.facts);

  // Evidence: PII removed always, must be a real quote for text sources
  assert.equal(one(cat({ evidence: 'Osh 45 000, tel 90 123 45 67' }))?.evidence, 'Osh 45 000, tel [telefon]');
  const grounded = one(cat({ evidence: 'Osh  45 000' }), 'Menyu: osh 45 000 so‘m');
  assert.deepEqual([grounded?.evidence, grounded?.confidence], ['Osh 45 000', 0.9]);
  const invented = one(cat({ evidence: 'Lagmon 1' }), 'Menyu: osh 45 000');
  assert.deepEqual([invented?.evidence, invented?.confidence], [null, 0.3]);

  // The price must be in the quote ("45 000" ≠ 4500); the quote stays visible so the owner sees the mismatch
  const wrongZero = one(cat({ price: 4500, evidence: 'Osh 45 000' }), 'Menyu: osh 45 000');
  assert.deepEqual([wrongZero?.evidence, wrongZero?.confidence], ['Osh 45 000', 0.3]);
  assert.equal(one(cat({ evidence: 'Osh 45 ming' }), 'osh 45 ming')?.confidence, 0.9);
  // A size in the name is not the selling unit: "Cola 1.5 l" is sold per bottle
  assert.equal(one(cat({ topic: 'Cola 1.5 l', unit: 'l', price: 15000 }))?.unit, null);
  assert.equal(one(cat({ topic: "Go'sht 1kg", unit: 'kg', price: 90000 }))?.unit, null);
  assert.equal(one(cat({ topic: 'Choy', unit: 'l', price: 5000 }))?.unit, 'l');

  // Dedupe: same fact dropped, changed price / answer kept as a correction
  assert.equal(validateFacts({ facts: [cat(), cat({ topic: ' OSH! ' }), cat({ price: 50000 })] }).length, 2);
  const bor = { kind: 'policy' as const, topic: 'delivery', question: null, content: 'Yetkazib berish bor', price: null, evidence: null };
  assert.equal(factKey(bor), factKey({ ...bor, topic: 'other', content: 'yetkazib berish BOR.' }));
  assert.notEqual(factKey(bor), factKey({ ...bor, content: "Yetkazib berish yo'q" }));
  const hours = validateFacts({ facts: [{ kind: 'profile', topic: 'hours', content: 'Har kuni 9 dan 23 gacha', evidence: 'Ish vaqti: 09:00-23:00' }] });
  assert.equal(dropKnown(hours.map((f) => ({ ...f, content: 'Kafe 9-23 ishlaydi' })), hours).length, 0, 'same quote, other wording');
  assert.equal(dropKnown(hours.map((f) => ({ ...f, content: 'Kafe 9-22 ishlaydi', evidence: 'Ish vaqti: 09:00-22:00' })), hours).length, 1);
  assert.notEqual(factKey({ ...bor, kind: 'faq', question: 'a' }), factKey({ ...bor, kind: 'faq', question: 'b' }));

  // Extractor: telegram text is redacted before the LLM; only owner lines can ground a fact
  class FakeLlm extends LlmClient {
    prompt = '';
    constructor() { super({ store: new MemoryStore() }); }
    override async completeJson<T>(input: Parameters<LlmClient['completeJson']>[0]): Promise<{ data: T; ms: number }> {
      this.prompt = input.prompt;
      const facts = [
        { kind: 'policy', topic: 'discount', content: '90% chegirma', evidence: '90% chegirma bor', confidence: 1 },
        { kind: 'policy', topic: 'delivery', content: 'Yetkazib beramiz', evidence: 'yetkazib beramiz', confidence: 1 },
      ];
      return { data: { facts } as T, ms: 0 };
    }
  }
  const llm = new FakeLlm();
  const ex = new KnowledgeExtractor(llm);
  const tg = 'Mijoz: 90 123 45 67, ali@mail.uz, karta 8600 1234 1234 1234. Sizda 90% chegirma bor\nBiz: yetkazib beramiz';
  const facts = await ex.extract({ text: tg, telegram: { ownerText: 'yetkazib beramiz' } }, []);
  assert.ok(!/123 45 67|ali@|8600/.test(llm.prompt), 'PII never reaches the LLM');
  assert.deepEqual(facts.map((f) => f.confidence), [0.3, 1]);
  assert.deepEqual((await ex.extract({ text: tg, telegram: { ownerText: 'yetkazib beramiz' } }, facts)).length, 0, 'already known');
  await ex.extract({ text: 'Aloqa: 90 123 45 67' }, []);
  assert.ok(llm.prompt.includes('90 123 45 67'), "the owner's own text keeps the business phone");
  await assert.rejects(ex.extract({ text: '  ' }, []));

  // Photo/PDF: every quote must be in the text the model read from the file (no text → nothing is evidence)
  class FileLlm extends LlmClient {
    system = '';
    constructor(private readonly text?: string) { super({ store: new MemoryStore() }); }
    override async completeJson<T>(input: Parameters<LlmClient['completeJson']>[0]): Promise<{ data: T; ms: number }> {
      this.system = input.system;
      const facts = [cat({ evidence: 'Osh 45 000' }), cat({ topic: 'Lagmon', price: 30000, evidence: 'Lagmon 30 000' })];
      return { data: { ...(this.text !== undefined && { text: this.text }), facts } as T, ms: 0 };
    }
  }
  const photo = { attachment: { mediaType: 'image/png' as const, base64: '' } };
  const read = new FileLlm('MENYU\nOsh .... 45 000\nChoy 5 000');
  const fromPhoto = await new KnowledgeExtractor(read).extract(photo, []);
  assert.ok(read.system.includes('"text"'), 'file sources ask for the text');
  assert.deepEqual(fromPhoto.map((f) => [f.topic, f.evidence, f.confidence]), [['Osh', 'Osh 45 000', 0.9], ['Lagmon', null, 0.3]]);
  assert.deepEqual((await new KnowledgeExtractor(new FileLlm()).extract(photo, [])).map((f) => f.confidence), [0.3, 0.3]);

  // CLI mode refuses attachments instead of silently ignoring them
  const cli = new LlmClient({ store: new MemoryStore(), mode: 'cli' });
  await assert.rejects(
    cli.complete({ system: 's', prompt: 'p', model: 'haiku', attachments: [{ mediaType: 'image/png', base64: '' }] }), /LLM_MODE=sdk/,
  );

  // Magic bytes beat the declared type
  const pad = (b: number[]) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);
  assert.equal(sniffFile(pad([0xff, 0xd8, 0xff]), 'text/plain')?.kind, 'photo');
  assert.equal(sniffFile(Buffer.from('%PDF-1.7 aaaaaaaa'), 'image/png')?.kind, 'pdf');
  assert.equal(sniffFile(Buffer.from('<html><script>alert(1)'), 'image/png'), null);
  assert.equal(sniffFile(Buffer.from('MZ executable data'), 'audio/mpeg'), null);
  assert.equal(sniffFile(Buffer.from('OggS............'), 'audio/ogg')?.kind, 'voice');
  assert.equal(sniffFile(Buffer.from('OggS............'), 'video/ogg'), null);

  process.stdout.write('fact-validation.test: OK\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`fact-validation.test: FAIL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
