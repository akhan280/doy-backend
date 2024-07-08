import { Injectable, Logger } from '@nestjs/common';

import { createClient } from 'redis';
import * as moment from 'moment-timezone';
import { PrismaService } from './prisma/prisma.service';
import { Contact, User } from '../../prisma/generated/client';


@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);
  private redisClient = createClient({ url: process.env.REDIS_URL });

  constructor(private prisma: PrismaService) {
    this.redisClient.connect()
      .then(() => this.logger.log('Connected to Redis'))
      .catch((error) => this.logger.error('Failed to connect to Redis', error));
  }

  async getCachedBirthdays(dateKey: string): Promise<(User & { contacts: Contact[] })[]> {
    this.logger.log(`Checking cache for birthdays with key: ${dateKey}`);
    const cachedData = await this.redisClient.get(dateKey);
    if (cachedData) {
      this.logger.log(`Found cached birthdays for key: ${dateKey}`);
    } else {
      this.logger.log(`No cached birthdays found for key: ${dateKey}`);
    }
    this.logger.log(`cached data: ${cachedData}`);
    return cachedData ? JSON.parse(cachedData) : null;
  }

  async fetchUsersWithBirthdays(daysAhead: number): Promise<(User & { contacts: Contact[] })[]> {
    const targetDate = moment().add(daysAhead, 'days');
    const dateKey = `birthdays:${targetDate.format('YYYY-MM-DD')}`;

    let users = await this.getCachedBirthdays(dateKey);

    if (!users) {
      this.logger.log(`No cached birthdays found. Querying database for birthdays ${daysAhead} days ahead.`);
      users = await this.prisma.$queryRaw`
        SELECT "User".*, "Contact".*
        FROM "User"
        JOIN "MessagePreferences" ON "User"."id" = "MessagePreferences"."userId"
        JOIN "Contact" ON "User"."id" = "Contact"."userId"
        WHERE 
          EXTRACT(MONTH FROM "Contact"."birthday") = ${targetDate.month() + 1}
          AND EXTRACT(DAY FROM "Contact"."birthday") = ${targetDate.date()}
          AND "MessagePreferences"."daysAhead${daysAhead}" = true
      `;

      this.logger.log(`Caching birthdays with key: ${dateKey}`);
      await this.redisClient.set(dateKey, JSON.stringify(users), {
        EX: 24 * 60 * 60, // expires in 24 hours
      });
    }

    return users;
  }
}
