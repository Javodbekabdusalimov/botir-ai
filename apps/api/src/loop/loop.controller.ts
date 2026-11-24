import { Controller, HttpCode, NotImplementedException, Param, Post } from '@nestjs/common';

const MSG = 'Loop engine is not merged into the API yet (branch agents/core). Endpoint reserved.';

@Controller('loop')
export class LoopController {
  @Post('run')
  @HttpCode(501)
  run(): never {
    throw new NotImplementedException(MSG);
  }

  @Post('proposals/:id/:decision')
  decide(@Param('id') _id: string): never {
    throw new NotImplementedException(MSG);
  }
}
