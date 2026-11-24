import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AGENTS_BRIDGE } from './agents-bridge';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';
import { RuleBasedNegotiationEngine } from './rule-based.engine';

/**
 * AGENTS_BRIDGE is the single seam to the agent layer.
 *
 * To switch to Habibulloh's live LLM agents, import his AgentsModule here and
 * let it provide AGENTS_BRIDGE instead of RuleBasedNegotiationEngine — no other
 * file changes.
 */
@Module({
  imports: [PaymentsModule],
  controllers: [NegotiationsController],
  providers: [
    NegotiationsService,
    RuleBasedNegotiationEngine,
    { provide: AGENTS_BRIDGE, useExisting: RuleBasedNegotiationEngine },
  ],
  exports: [NegotiationsService],
})
export class NegotiationsModule {}
