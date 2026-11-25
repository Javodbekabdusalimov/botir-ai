// Owner-confirmed facts of ONE business → compact prompt section for its agent.
// Catalog facts are excluded: CatalogItem is the only price source (PolicyGuard, computeTotal).
import type { KnowledgeFactKind } from '@botir/shared';
import type { PrismaService } from '../db/prisma.service';

type ContextKind = Exclude<KnowledgeFactKind, 'catalog'>;

/**
 * Character budget per group (≈3k tokens in total), so one group cannot push out the others.
 * A fact is used whole or skipped: half of a policy could mean the opposite.
 */
const GROUPS: { kind: ContextKind; title: string; budget: number }[] = [
  { kind: 'profile', title: 'Biznes haqida', budget: 1800 },
  { kind: 'policy', title: 'Shartlar', budget: 2200 },
  { kind: 'faq', title: 'Savol-javob', budget: 3500 },
  { kind: 'style', title: 'Muloqot uslubi', budget: 1100 },
];
const MAX_OUT_OF_STOCK = 30;

export interface ContextFact {
  kind: string;
  topic: string;
  question: string | null;
  content: string;
}

export interface KnowledgeInput {
  address?: string;
  /** Confirmed facts of one business, newest first (the oldest are dropped when a group is over budget). */
  facts: ContextFact[];
  outOfStock: string[];
}

/** One line, no line breaks: a fact can never look like a new prompt section. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const cut = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const factLine = (f: ContextFact): string => {
  const content = oneLine(f.content);
  const head = f.kind === 'faq' && f.question ? `${oneLine(f.question)} →` : `${oneLine(f.topic)}:`;
  return `- ${head} ${content}`;
};

/** Pure renderer; '' when the owner has not confirmed anything yet. */
export function renderKnowledge(input: KnowledgeInput): string {
  const sections: string[] = [];
  for (const g of GROUPS) {
    const lines: string[] = [];
    let used = 0;
    if (g.kind === 'profile' && input.address?.trim()) {
      const line = `- Manzil: ${cut(oneLine(input.address), 300)}`;
      lines.push(line);
      used += line.length;
    }
    for (const f of input.facts.filter((x) => x.kind === g.kind)) {
      const line = factLine(f);
      if (used + line.length > g.budget) continue;
      lines.push(line);
      used += line.length + 1;
    }
    if (lines.length) sections.push(`${g.title}:\n${lines.join('\n')}`);
  }
  if (input.outOfStock.length) {
    const names = input.outOfStock.slice(0, MAX_OUT_OF_STOCK).map((n) => cut(oneLine(n), 60)).join('; ');
    sections.push(`Hozir tugagan (taklif qilma, "hozircha yo'q" de): ${names}`);
  }
  return sections.join('\n');
}

/** Every query is scoped by businessId: one business never sees another's facts. */
export async function loadKnowledge(db: PrismaService, businessId: string): Promise<string> {
  const [business, facts, outOfStock] = await Promise.all([
    db.business.findFirst({ where: { id: businessId, deletedAt: null }, select: { address: true } }),
    db.knowledgeFact.findMany({
      where: { businessId, status: 'confirmed', deletedAt: null, kind: { not: 'catalog' } },
      orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
      select: { kind: true, topic: true, question: true, content: true },
      take: 200,
    }),
    db.catalogItem.findMany({
      where: { businessId, inStock: false, deletedAt: null }, select: { name: true }, take: MAX_OUT_OF_STOCK, orderBy: { updatedAt: 'desc' },
    }),
  ]);
  if (!business) return '';
  return renderKnowledge({ address: business.address, facts, outOfStock: outOfStock.map((c) => c.name) });
}
