// POST /agent/search core: parse + find businesses + catalog price, no negotiation, no discount, no order, no payment.
import type { AgentSearchBusiness, AgentSearchResult } from '@botir/shared';
import type { PersonalAgent } from '../agents/personal-agent';
import { computeTotal } from '../agents/policy-guard';
import type { Product, UserTask } from '../agents/types';

const MAX_BUSINESSES_PER_TASK = 5;
const MAX_MATCHES = 5;

const words = (s: string): string[] =>
  s.toLowerCase().replace(/[ʻʼ'‘’`]/g, '').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

/** Catalog items whose name shares a word (or prefix) with what the client asked for. */
export function matchProducts(task: UserTask, products: Product[]): Product[] {
  const asked = [...(task.items ?? []).map((i) => i.name), task.need].flatMap(words);
  return products.filter((p) => {
    const pw = words(`${p.name} ${p.description ?? ''}`);
    return asked.some((w) => pw.some((x) => x.startsWith(w) || w.startsWith(x)));
  });
}

/** Requested qty x catalog price, no discount. null when nothing in the catalog matches. */
export function searchTotal(task: UserTask, products: Product[], matches: Product[]): number | null {
  if (matches.length === 0) return null;
  const qtyOf = (p: Product): number => (task.items ?? []).find((i) => words(i.name).some((w) => words(p.name).some((x) => x.startsWith(w) || w.startsWith(x))))?.qty ?? 1;
  return computeTotal(products, { items: matches.map((p) => ({ productId: p.id, qty: qtyOf(p) })), discountPct: 0 });
}

export interface SearchDeps {
  agent: Pick<PersonalAgent, 'parse' | 'findBusinesses'>;
  getProducts: (businessId: string) => Promise<Product[]>;
  addressOf: (businessId: string) => Promise<{ address: string; district: string } | null>;
}

export async function agentSearch(deps: SearchDeps, text: string): Promise<AgentSearchResult> {
  const tasks = await deps.agent.parse(text);
  return {
    tasks: await Promise.all(
      tasks.map(async (task) => {
        const found = (await deps.agent.findBusinesses(task)).slice(0, MAX_BUSINESSES_PER_TASK);
        const businesses = await Promise.all(
          found.map(async (b): Promise<AgentSearchBusiness> => {
            const [products, where] = await Promise.all([deps.getProducts(b.id), deps.addressOf(b.id)]);
            const matches = matchProducts(task, products);
            return {
              id: b.id, name: b.name, category: b.category,
              district: where?.district ?? b.area, address: where?.address ?? '',
              matches: matches.slice(0, MAX_MATCHES).map((p) => ({ name: p.name, price: p.price, unit: p.unit })),
              total: searchTotal(task, products, matches),
            };
          }),
        );
        return { need: task.need, category: task.category, businesses };
      }),
    ),
  };
}
