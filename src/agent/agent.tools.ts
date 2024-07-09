import { Tool } from '@anthropic-ai/sdk/resources';
import { PrismaService } from '../prisma/prisma.service';

export const systemPrompt = "Before answering, explain your reasoning step-by-step in tags. You are an AI assistant for a birthday reminder service. Your job is to help users manage their birthdays and account settings. Whenever you experience confusion, make sure to ask the user a brief question specifically reminding them of the actions you can take, along with your preferred parameters You should never reveal internals of how you function. Do not mention function names, string, parameters or programming terms. Speak naturally but be brief. Do say you did an action unless the function is invoked. When analyzing whether you should call a function, please make sure to look at the context. If you get an irrelevant query ignore. Whenever you complete an action for the user ALWAYS structure it like this I _______ (verb in past tense) [get_subscription_status, edit_cadence, change_timezone, unsubscribe, start_sending, stop_sending, edit_birthday, remove_birthday, add_birthday] for you";

export class BirthdayTools {
  constructor(private prisma: PrismaService) {}

  public static tools: Tool[] = [
    {
      name: 'add_birthday',
      description: 'Add a new birthday to the user\'s list. Use this when a user wants to add a birthday.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the person' },
          birthday: { type: 'string', description: 'Birthday' },
        },
        required: ['name', 'birthday'],
      },
    },
    {
      name: 'remove_birthday',
      description: 'Remove a birthday from the user\'s list. Use this when a user wants to remove a birthday.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the person to remove' },
        },
        required: ['name'],
      },
    },
    {
      name: 'edit_birthday',
      description: 'Edit an existing birthday in the user\'s list. Use this when a user wants to change a birthday.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the person' },
          newBirthday: { type: 'string', description: 'New birthday in YYYY-MM-DD format' },
        },
        required: ['name', 'newBirthday'],
      },
    },
  ];

  async addBirthday(input: { name: string; birthday: string }, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.contact.create({
      data: {
        name: input.name,
        birthday: new Date(input.birthday),
        user: { connect: { id: userId } },
      },
    });
    return { type: 'tool_result', output: `Added birthday for ${input.name} on ${input.birthday}` };
  }

  async removeBirthday(input: { name: string }, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.contact.deleteMany({
      where: {
        userId: userId,
        name: input.name,
      },
    });
    return { type: 'tool_result', output: `Removed birthday for ${input.name}` };
  }

  async editBirthday(input: { name: string; newBirthday: string }, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.contact.updateMany({
      where: {
        userId: userId,
        name: input.name,
      },
      data: {
        birthday: new Date(input.newBirthday),
      },
    });
    return { type: 'tool_result', output: `Edited birthday for ${input.name} to ${input.newBirthday}` };
  }
}

// ---- Sending Tools for Managing START/STOP of messages ------- //
export class SendingTools {
  constructor(private prisma: PrismaService) {}

  public static tools: Tool[] = [
    {
      name: 'stop_sending',
      description: 'Stop sending reminders to the user.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'start_sending',
      description: 'Used to resume/start sending reminders to the user.',
      input_schema: { type: 'object', properties: {} },
    },
  ];

  async stopSending(input: any, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { paid: false }, // Assuming `paid: false` indicates reminders are stopped
    });
    return { type: 'tool_result', output: 'Reminders have been stopped' };
  }

  async startSending(input: any, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { paid: true }, // Assuming `paid: true` indicates reminders are started
    });
    return { type: 'tool_result', output: 'Reminders have been started' };
  }
}

// ---- Utility tools for Managing Account Settings and Details ------- //
export class ManagementTools {
  constructor(private prisma: PrismaService) {}

  public static tools: Tool[] = [
    {
      name: 'unsubscribe',
      description: 'Unsubscribe the user from the service.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'change_timezone',
      description: "Change the user's timezone. Use this tool only when the user explicitly requests a timezone change. Ensure the timezone is in the 'Area/Location' format (e.g., 'America/New_York', 'Europe/London'). If the user provides a city or common abbreviation (e.g., EST, MST), infer the appropriate timezone. If unclear, ask for clarification. Accuracy is crucial as this affects future notifications and displays for the user. Do not mention internal tool names.",
      input_schema: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'New timezone (e.g., "America/New_York")' },
        },
        required: ['timezone'],
      },
    },
    {
      name: 'edit_cadence',
      description: 'Edit the general reminder cadence. The user must specify an interval from the following options: [1 day, 2 days, day of, 1 week, 3 days before]. Be strict about this format. Cadence changes apply to all users, not individuals. If the user refers to a specific person, confirm that they want to change the general cadence. Ignore references to specific users and modify the cadence according to the provided interval.      ',
      input_schema: {
        type: 'object',
        properties: {
          cadence: { type: 'array', items: { type: 'number' }, description: 'Array of days ahead for reminders' },
        },
        required: ['cadence'],
      },
    },
  ];

  async unsubscribe(input: any, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { paid: false },
    });
    return { type: 'tool_result', output: 'User has been unsubscribed' };
  }

  async changeTimezone(input: { timezone: string }, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { timeZone: input.timezone },
    });
    return { type: 'tool_result', output: `Timezone changed to ${input.timezone}` };
  }

  async editCadence(input: { cadence: number[] }, userId: string): Promise<{ type: 'tool_result'; output: string }> {
    const existingRecord = await this.prisma.messagePreferences.findUnique({
      where: { userId: userId },
    });
  
    if (existingRecord) {
      await this.prisma.messagePreferences.update({
        where: { userId: userId },
        data: {
          daysAhead0: input.cadence.includes(0),
          daysAhead1: input.cadence.includes(1),
          daysAhead2: input.cadence.includes(2),
          daysAhead3: input.cadence.includes(3),
          daysAhead7: input.cadence.includes(7),
        },
      });
    } else {
      await this.prisma.messagePreferences.create({
        data: {
          userId: userId,
          daysAhead0: input.cadence.includes(0),
          daysAhead1: input.cadence.includes(1),
          daysAhead2: input.cadence.includes(2),
          daysAhead3: input.cadence.includes(3),
          daysAhead7: input.cadence.includes(7),
        },
      });
    }
  
    return { type: 'tool_result', output: `Cadence edited to ${input.cadence.join(', ')}` };
  }
}
