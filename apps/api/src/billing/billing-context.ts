// Who pays for the AI work of the current request. Set once per HTTP request by BillingMiddleware; everything the handler
// starts (including fire-and-forget background work) inherits it through AsyncLocalStorage. Framework-free on purpose:
// the agent layer (LlmClient) imports it.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { BillingOwnerType } from '@botir/shared';

export interface BillingOwner {
  ownerType: BillingOwnerType;
  ownerId: string;
}

const storage = new AsyncLocalStorage<BillingOwner>();

export const runWithBillingOwner = <T>(owner: BillingOwner, fn: () => T): T => storage.run(owner, fn);

export const currentBillingOwner = (): BillingOwner | undefined => storage.getStore();
