import { Injectable, Logger } from '@nestjs/common';

import { createClient } from 'redis';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
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

    // = await this.getCachedBirthdays(dateKey);
    let users = await this.getCachedBirthdays(dateKey);

    if (!users) {
      this.logger.log(`No cached birthdays found. Querying database for birthdays ${daysAhead} days ahead.`);
      users = await this.prisma.$queryRaw`
      WITH filtered_contacts AS (
        SELECT "Contact".*
        FROM "Contact"
        WHERE EXTRACT(MONTH FROM "Contact"."birthday") = ${targetDate.month() + 1}
          AND EXTRACT(DAY FROM "Contact"."birthday") = ${targetDate.date()}
      )
      SELECT 
        "User".*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', fc.id,
              'name', fc.name,
              'phoneNumber', fc."phoneNumber",
              'birthday', fc.birthday,
              'userId', fc."userId",
              'notify', fc.notify,
              'profilePicture', fc."profilePicture",
              'street', fc.street,
              'city', fc.city,
              'state', fc.state,
              'zipCode', fc."zipCode"
            )
          ) FILTER (WHERE fc.id IS NOT NULL),
          '[]'
        ) as contacts
      FROM "User"
      JOIN "MessagePreferences" ON "User"."id" = "MessagePreferences"."userId"
      LEFT JOIN filtered_contacts fc ON "User"."id" = fc."userId"
      WHERE (
        (${daysAhead} = 0 AND "MessagePreferences"."daysAhead0" = true) OR
        (${daysAhead} = 1 AND "MessagePreferences"."daysAhead1" = true) OR
        (${daysAhead} = 2 AND "MessagePreferences"."daysAhead2" = true) OR
        (${daysAhead} = 3 AND "MessagePreferences"."daysAhead3" = true) OR
        (${daysAhead} = 7 AND "MessagePreferences"."daysAhead7" = true)
      )
      GROUP BY "User"."id"
    `;

      console.log(users)

      this.logger.log(`Caching birthdays with key: ${dateKey}`);
      await this.redisClient.set(dateKey, JSON.stringify(users), {
        EX: 24 * 60 * 60, // expires in 24 hours
      });
    }

    return users;
  }
}
