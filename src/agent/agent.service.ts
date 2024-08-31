// llm-agent.service.ts
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Message, MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { BirthdayTools, ManagementTools, SendingTools, systemPrompt } from './agent.tools';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../prisma/generated/client';
import openai, { OpenAI } from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources';

const client = new OpenAI()

@Injectable()
export class LlmAgentService {
  private anthropic: Anthropic;
  private birthdayService: BirthdayTools;
  private managementService: ManagementTools;
  private sendingService: SendingTools;
  private tools: ChatCompletionTool[];

  constructor(private prisma: PrismaService) {
    // this.anthropic = new Anthropic({
    //   apiKey: process.env.ANTHROPIC_API_KEY,
    // });

    this.birthdayService = new BirthdayTools(prisma);
    this.managementService = new ManagementTools(prisma);
    this.sendingService = new SendingTools(prisma);
    
    
    const tools: ChatCompletionTool[] = [
      ...BirthdayTools.tools.map(tool => ({
        type: 'function' as const,
        function: tool
      })),
      ...ManagementTools.tools.map(tool => ({
        type: 'function' as const,
        function: tool 
      })),
      ...SendingTools.tools.map(tool => ({
        type: 'function' as const,
        function: tool
      }))
    ];  
  }


  async processUserMessage(userMessage: string, userID: string): Promise<string> {

    // ---- FORMATTING CONTEXT -------
    // 1. User message needs to be first
    // 2. User and assistant must alternate
    // 3. We must be within the context window
    const lastFunctionCall = await this.prisma.message.findFirst({
      where: { 
        conversation: { userId: userID },
        functionCalled: { not: null }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('[AGENT] Last function call was', lastFunctionCall)
  
    // Fetch conversation messages, starting from the last function call (if any)
    let conversation = await this.prisma.conversation.findFirst({
      where: { userId: userID },
      include: { 
        messages: { 
          where: lastFunctionCall 
            ? { createdAt: { gte: lastFunctionCall.createdAt } }
            : {},
          orderBy: { createdAt: 'desc' } 
        }
      },
    });

    console.log('[AGENT] Conversation', conversation)
  
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          user: { connect: { id: userID } },
        },
        include: { messages: true },
      });
    }  

    let contextMessages: ChatCompletionMessageParam[] = [];
    let messageCount = 0;
    const maxContextMessages = 3;
  
    // Ensure strict alternation
    let expectedRole: 'user' | 'assistant' = 'assistant';  // Start with assistant as we'll add the new user message last
  
    for (const msg of conversation.messages) {
      if (messageCount >= maxContextMessages) break;
      
      if (msg.role === expectedRole) {
        contextMessages.unshift({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
        messageCount++;
        expectedRole = expectedRole === 'user' ? 'assistant' : 'user';
      }
    }
  
    // If the first message is from assistant, prepend a dummy user message
    if (contextMessages.length > 0 && contextMessages[0].role === 'assistant') {
      contextMessages.unshift({ role: 'user', content: 'Hello' });
    }
  
    contextMessages.push({ role: 'user', content: userMessage });
  
    const inputQuery = await this.prisma.message.create({
      data: {
        conversation: { connect: { id: conversation.id } },
        role: 'user',
        content: userMessage,
        isUserMessage: true,
      }
    });

    // ---- END FORMATTING CONTEXT -------

    // ---- START OPENAI GENERATION -----
    
    console.log('[CONTEXT MESSAGES] Messages before response', contextMessages);

    // const response = await this.anthropic.messages.create({
    //   model: process.env.ANTHROPIC_MODEL,
    //   max_tokens: 4096,
    //   system: systemPrompt, 
    //   messages: contextMessages,
    //   tools: this.tools,
    //   tool_choice: {"type": "any"},
    // });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL, 
      messages: contextMessages, 
      tools: this.tools
    })
    const response = completion.choices[0]

    console.log('[Agent] Stop Reason', response.finish_reason);

    contextMessages.push(
      {"role": "assistant", "content": response.message.content}
    )

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversation: { connect: { id: conversation.id } },
        role: 'assistant',
        content: response.finish_reason === 'tool_calls' ? JSON.stringify(response.message.tool_calls) : response.message.content,
        isUserMessage: false,
      }
    });

    if (response.finish_reason === 'tool_calls') {

      console.log('[Agent] Tool_use triggered');
      const toolUseBlock = response.message.tool_calls[0];
      const functionCall = toolUseBlock.function
      

      const result = await this.executeToolUse(functionCall.name, functionCall.arguments, userID);

      await this.prisma.message.update({
        where: {id: assistantMessage.id},
        data: {
          content: JSON.stringify(toolUseBlock),
          isUserMessage: false,
          functionCalled: functionCall.name,
          functionResult: result.output,
        }
      });

      contextMessages.push({ role: 'assistant', content: JSON.stringify(response.message) });
      contextMessages.push({ role: 'user', content: JSON.stringify(result) });

      return JSON.stringify(result);

    } else if (response.message.content) {
      return response.message.content;
    }
    return `Unexpected response format ${response.finish_reason}`;
  }

  private async executeToolUse(toolName: string, input: any, userId: string): Promise<{ type: 'tool_result', output: string }> {
    console.log('[Agent] Executing tool use', toolName, input);

    switch (toolName) {
      // Birthday Management
      case 'add_birthday':
        return this.birthdayService.addBirthday(input, userId);
      case 'remove_birthday':
        return this.birthdayService.removeBirthday(input, userId);
      case 'edit_birthday':
        return this.birthdayService.editBirthday(input, userId);
      
       // Account Management
      case 'unsubscribe':
        return this.managementService.unsubscribe(input, userId);
      case 'change_timezone':
        return this.managementService.changeTimezone(input, userId);
      case 'edit_cadence':
        return this.managementService.editCadence(input, userId);
      case 'irrelevant':
          return this.managementService.irrelevant();
  
      // Sending Utils
      case 'stop_sending':
        return this.sendingService.stopSending(input, userId);
      case 'start_sending':
        return this.sendingService.startSending(input, userId);

      default:
        return { type: 'tool_result', output: 'Unknown tool' };
    }
  }
}
