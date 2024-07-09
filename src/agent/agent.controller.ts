import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { LlmAgentService } from './agent.service';
import { RetrieveAgentMessageDTO } from './dto/retrieve-agent.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: LlmAgentService) {}

  @Post()
  create(@Body() retrieveAgentDTO: RetrieveAgentMessageDTO) {
    return this.agentService.processUserMessage(retrieveAgentDTO.query, retrieveAgentDTO.userId);
  }

}