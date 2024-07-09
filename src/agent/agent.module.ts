import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { LlmAgentService } from './agent.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AgentController],
  providers: [LlmAgentService],
})
export class AgentModule {}
