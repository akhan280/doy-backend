import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as moment from 'moment-timezone';
import { Resend } from 'resend';
import { Contact, User } from '../../prisma/generated/client';
import { createClient } from 'redis';

@Injectable()
export class RecurringMessagesService {
  private readonly logger = new Logger(RecurringMessagesService.name);
  private resend = new Resend(process.env.RESEND_KEY);
  private redisClient = createClient({ url: process.env.REDIS_URL });

  constructor(private prisma: PrismaService) {
    this.redisClient.connect()
      .then(() => this.logger.log('Connected to Redis'))
      .catch((error) => this.logger.error('Failed to connect to Redis', error));
  }

  private async sendTextMessage(user: User, contact: Contact) {
    this.logger.log(`Preparing to send text message to ${user.name} for ${contact.name}'s birthday`);

    const birthDate = new Date(contact.birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    try {
      const response = await fetch(`${process.env.MESSAGE_SERVER}/api/v1/chat/new?password=Hyperfan2024`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "addresses": [user.phone],
            "message": `Hey, daysoftheyear here. Reminder that today is ${contact.name}'s birthday! They're turning ${age}.`
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      this.logger.log(`Successfully sent birthday message to ${user.name} for ${contact.name}`);
            
    } catch (error) {
      this.logger.error(`Error sending message to ${user.name} for ${contact.name}`, error);

      this.resend.emails.send({
        from: 'info@daysoftheyear.me',
        to: 'areebk@umich.edu, anniesha51@gmail.com',
        subject: 'Message failed to send!',
        html: `<p>Error: daysoftheyear didn't send a birthday message to <strong>${contact.name} for user ${user.name}</strong>!</p><p>Error details: ${error.message}</p>`
      });

      this.logger.log(`Notification email sent for failed message to ${user.name} for ${contact.name}`);
    }
  }

  private async getCachedBirthdays(dateKey: string): Promise<(User & { contacts: Contact[] })[]> {
    this.logger.log(`Checking cache for birthdays with key: ${dateKey}`);
    const cachedData = await this.redisClient.get(dateKey);
    if (cachedData) {
      this.logger.log(`Found cached birthdays for key: ${dateKey}`);
    } else {
      this.logger.log(`No cached birthdays found for key: ${dateKey}`);
    }
    return cachedData ? JSON.parse(cachedData) : null;
  }

  private async cacheBirthdays(dateKey: string, data: (User & { contacts: Contact[] })[]) {
    this.logger.log(`Caching birthdays with key: ${dateKey}`);
    await this.redisClient.set(dateKey, JSON.stringify(data), {
      EX: 24 * 60 * 60, // Cache expires in 24 hours
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sendMorningMessage() {
    const today = new Date();
    const todayKey = `birthdays:${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    this.logger.log(`Starting sendMorningMessage job for ${today.toISOString()}`);

    let users = await this.getCachedBirthdays(todayKey);

    if (!users) {
      this.logger.log(`No cached birthdays found. Querying database for today's birthdays.`);
      users = await this.prisma.user.findMany({
        where: {
          timeZone: { not: null },
          contacts: {
            some: {
              birthday: {
                gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
                lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0),
              },
            },
          },
        },
        include: {
          contacts: {
            where: {
              birthday: {
                gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
                lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0),
              },
            },
          },
        },
      });

      await this.cacheBirthdays(todayKey, users);
    }

    for (const user of users) {
      const userTime = moment().tz(user.timeZone);
      if (userTime.hour() === 10) { // Assuming 10 AM is the desired morning time
        for (const contact of user.contacts) {
          this.logger.log(`Sending birthday notification to ${user.name} for ${contact.name}'s birthday`);
          await this.sendTextMessage(user, contact);
        }      
      }
    }

    this.logger.log(`Completed sendMorningMessage job for ${today.toISOString()}`);
  }
}
