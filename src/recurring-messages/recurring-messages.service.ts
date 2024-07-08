import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
;
import { Resend } from 'resend';
import * as moment from 'moment-timezone';
import { DataService } from '../data/data.service';
import { Contact, User } from '../../prisma/generated/client';


@Injectable()
export class RecurringMessagesService {
  private readonly logger = new Logger(RecurringMessagesService.name);
  private resend = new Resend(process.env.RESEND_KEY);

  constructor(private dataService: DataService) {}

  private async sendTextMessage(user: User, contact: Contact, content: string) {
    this.logger.log(`Preparing to send text message to ${user.name} for ${contact.name}'s birthday`);
    try {
        const response = await fetch(`${process.env.MESSAGE_SERVER}/api/v1/chat/new?password=Hyperfan2024`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addresses: [user.phone],
            message: content,
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.statusText}`);
        }
    } catch (error) {
      this.logger.error(`Error sending message to ${user.name} for ${contact.name}`, error);
      this.resend.emails.send({
        from: 'info@daysoftheyear.me',
        to: 'areebk@umich.edu, anniesha51@gmail.com',
        subject: 'Message failed to send!',
        html: `<p>Error: daysoftheyear didn't send a birthday message to <strong>${contact.name} for user ${user.name}</strong>!</p><p>Error details: ${error.message}</p>`,
      });
      this.logger.log(`Notification email sent for failed message to ${user.name} for ${contact.name}`);
    }
  }

  private async sendMessagesForUpcomingBirthdays(daysAhead: number, contentCallback: (user: User, contact: Contact) => string) {
    const users = await this.dataService.fetchUsersWithBirthdays(daysAhead);

    for (const user of users) {
      const userTime = moment().tz(user.timeZone);
      if (userTime.hour() === 17) { // Optimal time to send message
        for (const contact of user.contacts) {
          this.logger.log(`Sending birthday notification to ${user.name} for ${contact.name}'s birthday`);

          const messageContent = contentCallback(user, contact);
          await this.sendTextMessage(user, contact, messageContent);
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processBirthdayMessages() {
    const today = new Date();
    this.logger.log(`Starting processBirthdayMessages job for ${today.toISOString()}`);

    await this.sendMessagesForUpcomingBirthdays(0, (user, contact) => `Hey, there. Just a reminder that today is ${contact.name}'s birthday.`);
    await this.sendMessagesForUpcomingBirthdays(1, (user, contact) => `Hey, there. Just a reminder that tomorrow is ${contact.name}'s birthday.`);
    await this.sendMessagesForUpcomingBirthdays(2, (user, contact) => `Hey, there. Just a reminder that in 2 days it's ${contact.name}'s birthday.`);
    await this.sendMessagesForUpcomingBirthdays(3, (user, contact) => `Hey, there. Just a reminder that in 3 days it's ${contact.name}'s birthday.`);
    await this.sendMessagesForUpcomingBirthdays(7, (user, contact) => `Hey, there. Just a reminder that in a week it's ${contact.name}'s birthday.`);

    this.logger.log(`Completed processBirthdayMessages job for ${today.toISOString()}`);
  }
}
