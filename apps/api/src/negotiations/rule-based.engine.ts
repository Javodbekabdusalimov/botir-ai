import { Injectable, Logger } from '@nestjs/common';
import type { BusinessCategory, CatalogItem } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { A2APayload, AgentTurn, AgentsBridge, NegotiationTask } from './agents-bridge';

/**
 * Deterministic baseline negotiator — NOT an LLM and not pretending to be one.
 *
 * It is a real algorithm, not a scripted demo: offers are built from catalog rows
 * in the database, and every discount is clamped to the business's own
 * maxDiscountPct (the PolicyGuard rule from ARCHITECTURE section 3.4). The live
 * LLM agents in src/agents replace this by providing AGENTS_BRIDGE; until then
 * the product still works end to end.
 */
@Injectable()
export class RuleBasedNegotiationEngine implements AgentsBridge {
  private readonly logger = new Logger(RuleBasedNegotiationEngine.name);

  private static readonly CATEGORY_HINTS: ReadonlyArray<[BusinessCategory, readonly string[]]> = [
    ['restaurant', ['osh', 'restoran', 'kafe', 'stol', 'ovqat', 'tuy', 'банкет', 'ресторан', 'стол']],
    ['autoservice', ['moy', 'servis', 'mashina', 'avto', 'diagnostika', 'shina', 'сервис', 'масло']],
    ['shop', ['market', 'mahsulot', 'xarid', 'dokon', 'магазин', 'продукт']],
    ['clinic', ['shifokor', 'klinika', 'tahlil', 'qabul', 'клиника', 'врач']],
    ['beauty', ['soch', 'salon', 'manikyur', 'стрижка', 'салон']],
  ];

  private static readonly MAX_ROUNDS = 3;
  private static readonly COUNTER_ASK_PCT = 10;
  private static readonly OFFER_TTL_MIN = 30;
  private static readonly DEFAULT_SLOT_MIN = 90;

  constructor(private readonly prisma: PrismaService) {}

  async parseTasks(text: string): Promise<NegotiationTask[]> {
    const lower = text.toLowerCase();
    const segments = lower
      .split(/,|;|\bkeyin\b|\bva\b|\bзатем\b|\bпотом\b/u)
      .map((part) => part.trim())
      .filter((part) => part.length > 2);

    const parts = segments.length > 0 ? segments : [lower];
    const tasks: NegotiationTask[] = [];

    for (const part of parts) {
      const category = this.detectCategory(part);
      if (!category) continue;
      tasks.push({
        taskId: randomUUID(),
        category,
        need: part,
        people: this.detectPeople(part),
        when: this.detectWhen(part),
        where: this.detectDistrict(part),
        budget: this.detectBudget(part),
      });
    }

    if (tasks.length === 0) {
      this.logger.warn('no task category recognised in request text');
    }
    return tasks;
  }

  async *negotiate(task: NegotiationTask, businessId: string): AsyncIterable<AgentTurn> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, isDeleted: false },
      include: { catalogItems: { where: { isDeleted: false, inStock: true }, orderBy: { price: 'asc' } } },
    });
    if (!business) return;

    const request: A2APayload = {
      type: 'REQUEST',
      taskId: task.taskId,
      need: task.need,
      ...(task.when ? { when: task.when } : {}),
      ...(task.people ? { people: task.people } : {}),
      ...(task.budget ? { budget: task.budget } : {}),
    };
    yield {
      fromAgent: 'personal',
      businessId,
      round: 1,
      text: this.requestLine(task),
      payload: request,
    };

    const picked = this.pickItems(business.catalogItems, task);
    if (picked.length === 0) {
      yield {
        fromAgent: 'business',
        businessId,
        round: 1,
        text: `${business.name}: afsus, katalogda mos pozitsiya topilmadi.`,
        payload: { type: 'REJECT', reason: 'no matching catalog item' },
      };
      return;
    }

    const basePrice = picked.reduce((sum, item) => sum + item.price * item.qty, 0);
    const offer = this.buildOffer(picked, basePrice, 0, task);
    yield {
      fromAgent: 'business',
      businessId,
      round: 1,
      text: `${business.name}: ${this.describeItems(picked)} — ${this.money(basePrice)}.`,
      payload: offer,
    };

    // Round 2: the personal agent always pushes for a discount on the customer's behalf.
    const ask = Math.min(RuleBasedNegotiationEngine.COUNTER_ASK_PCT, 100);
    yield {
      fromAgent: 'personal',
      businessId,
      round: 2,
      text: `Mijoz agenti: ${ask}% chegirma bo'lsa, bugun tasdiqlaymiz.`,
      payload: { type: 'COUNTER', askDiscountPct: ask, reason: 'customer confirms today' },
    };

    // PolicyGuard: a discount above the business limit is never offered.
    const granted = Math.min(ask, business.maxDiscountPct);
    const finalPrice = Math.round(basePrice * (1 - granted / 100));

    if (granted <= 0) {
      yield {
        fromAgent: 'business',
        businessId,
        round: RuleBasedNegotiationEngine.MAX_ROUNDS,
        text: `${business.name}: chegirma limiti 0% — narx ${this.money(basePrice)} bo'lib qoladi.`,
        payload: this.buildOffer(picked, basePrice, 0, task),
      };
      yield {
        fromAgent: 'personal',
        businessId,
        round: RuleBasedNegotiationEngine.MAX_ROUNDS,
        text: 'Mijoz agenti: kelishdik, chegirmasiz tasdiqlaymiz.',
        payload: { type: 'ACCEPT' },
      };
      return;
    }

    yield {
      fromAgent: 'business',
      businessId,
      round: RuleBasedNegotiationEngine.MAX_ROUNDS,
      text: `${business.name}: ${granted}% chegirma — ${this.money(finalPrice)}.`,
      payload: this.buildOffer(picked, finalPrice, granted, task),
    };
    yield {
      fromAgent: 'personal',
      businessId,
      round: RuleBasedNegotiationEngine.MAX_ROUNDS,
      text: `Mijoz agenti: kelishdik — ${this.money(finalPrice)}.`,
      payload: { type: 'ACCEPT' },
    };
  }

  private buildOffer(
    picked: { item: CatalogItem; qty: number; price: number }[],
    price: number,
    discountPct: number,
    task: NegotiationTask,
  ): Extract<A2APayload, { type: 'OFFER' }> {
    const start = task.when ? new Date(task.when) : new Date(Date.now() + 3_600_000);
    const end = new Date(start.getTime() + RuleBasedNegotiationEngine.DEFAULT_SLOT_MIN * 60_000);

    return {
      type: 'OFFER',
      items: picked.map((row) => ({
        catalogItemId: row.item.id,
        name: row.item.name,
        qty: row.qty,
        price: row.item.price,
      })),
      price,
      discountPct,
      validUntil: new Date(
        Date.now() + RuleBasedNegotiationEngine.OFFER_TTL_MIN * 60_000,
      ).toISOString(),
      slot: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  /** Picks catalog rows by keyword overlap, then by cheapest fit for the party size. */
  private pickItems(
    items: CatalogItem[],
    task: NegotiationTask,
  ): { item: CatalogItem; qty: number; price: number }[] {
    if (items.length === 0) return [];

    const words = task.need.split(/\s+/).filter((word) => word.length > 3);
    const scored = items
      .map((item) => {
        const haystack = `${item.name} ${item.description ?? ''} ${item.tags.join(' ')}`.toLowerCase();
        const score = words.reduce((sum, word) => (haystack.includes(word) ? sum + 1 : sum), 0);
        return { item, score };
      })
      .sort((a, b) => b.score - a.score || a.item.price - b.item.price);

    const best = scored[0];
    if (!best) return [];

    const chosen = best.score > 0 ? best.item : scored[scored.length - 1].item;
    const qty = task.people && task.people > 0 && chosen.unit.toLowerCase().includes('porsiya')
      ? task.people
      : 1;

    return [{ item: chosen, qty, price: chosen.price }];
  }

  private detectCategory(text: string): BusinessCategory | undefined {
    for (const [category, hints] of RuleBasedNegotiationEngine.CATEGORY_HINTS) {
      if (hints.some((hint) => text.includes(hint))) return category;
    }
    return undefined;
  }

  private detectPeople(text: string): number | undefined {
    const match = /(\d{1,3})\s*(kishi|odam|человек|чел)/u.exec(text);
    return match ? Number(match[1]) : undefined;
  }

  private detectBudget(text: string): number | undefined {
    const match = /(\d[\d\s]{2,})\s*(so'm|som|сум|ming|минг)/u.exec(text);
    if (!match) return undefined;
    const digits = Number(match[1].replace(/\s/g, ''));
    if (!Number.isFinite(digits)) return undefined;
    return /ming|минг/u.test(match[2]) ? digits * 1000 : digits;
  }

  private detectWhen(text: string): string | undefined {
    const time = /(\d{1,2})[:.](\d{2})/u.exec(text);
    const hourOnly = /\b(\d{1,2})\s*(da|ga|часов|час)\b/u.exec(text);
    const base = new Date();

    if (/ertaga|завтра/u.test(text)) base.setDate(base.getDate() + 1);
    else if (!/bugun|сегодня/u.test(text) && !time && !hourOnly) return undefined;

    const hour = time ? Number(time[1]) : hourOnly ? Number(hourOnly[1]) : 19;
    const minute = time ? Number(time[2]) : 0;
    if (hour > 23 || minute > 59) return undefined;

    base.setHours(hour, minute, 0, 0);
    return base.toISOString();
  }

  private detectDistrict(text: string): string | undefined {
    const match = /(chilonzor|yunusobod|mirzo\s?ulugbek|sergeli|yakkasaroy|olmazor|uchtepa|shayxontohur|bektemir|mirobod)/u.exec(
      text,
    );
    return match ? match[1] : undefined;
  }

  private requestLine(task: NegotiationTask): string {
    const parts = [`Mijoz agenti: ${task.need.trim()}`];
    if (task.people) parts.push(`${task.people} kishi`);
    if (task.when) parts.push(new Date(task.when).toLocaleString('uz-UZ'));
    return parts.join(' · ');
  }

  private money(amount: number): string {
    return `${amount.toLocaleString('uz-UZ')} so'm`;
  }
}
