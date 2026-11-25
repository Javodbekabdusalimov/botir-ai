// One middleware for every POST: (1) sets the billing owner context for the whole request (LlmClient reads it),
// (2) gates the PRO features. Lives here, via forRoutes, so the negotiations / tg controllers stay untouched.
// Fail-open: a billing bug must never take the product down. BILLING_ENFORCE=1 turns blocking on (default: log only).
import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { UpgradeRequired } from '@botir/shared';
import { errMsg } from '../common/http';
import { BillingService, type GateKind } from './billing.service';
import { runWithBillingOwner } from './billing-context';

const GATED: { match: RegExp; kind: GateKind }[] = [
  { match: /^\/agent\/request$/, kind: 'agent' },
  { match: /^\/negotiations\/[^/]+\/confirm$/, kind: 'agent' },
  { match: /^\/tg-connect\/start$/, kind: 'telegram' },
  { match: /^\/me\/tg-connect\/start$/, kind: 'telegram' },
];

export const enforcing = (): boolean => process.env.BILLING_ENFORCE === '1';

@Injectable()
export class BillingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('BillingGate');

  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = (req.originalUrl ?? req.url).split('?')[0].replace(/\/+$/, '') || '/';
    const body: unknown = req.body;
    const guestId = body && typeof body === 'object' ? (body as { userId?: unknown }).userId : undefined;
    let owner;
    try {
      owner = await this.billing.resolveOwner(req.headers.authorization, typeof guestId === 'string' ? guestId : undefined);
      const gated = GATED.find((g) => g.match.test(path));
      const message = gated ? await this.billing.gate(owner, gated.kind) : null;
      if (message) {
        if (enforcing()) {
          const payload: UpgradeRequired = { ok: false, error: message, upgrade: true };
          res.status(402).json(payload);
          return;
        }
        this.logger.warn(`would block ${path} for ${owner.ownerType}:${owner.ownerId}: ${message} (BILLING_ENFORCE=0)`);
      }
    } catch (e) {
      this.logger.warn(`gate error on ${path}, letting the request through: ${errMsg(e)}`);
    }
    if (owner) runWithBillingOwner(owner, next);
    else next();
  }
}
