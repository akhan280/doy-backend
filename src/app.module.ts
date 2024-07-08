// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './data/prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';
import { RecurringMessagesModule } from './recurring-messages/recurring-messages.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DataModule } from './data/data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SupabaseModule,
    RecurringMessagesModule,
    DataModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
