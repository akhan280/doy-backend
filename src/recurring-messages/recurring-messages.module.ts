import { Module } from '@nestjs/common';
import { RecurringMessagesService } from './recurring-messages.service';
import { RecurringMessagesController } from './recurring-messages.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DataModule } from '../data/data.module';
import { DataService } from '../data/data.service';

@Module({
  imports: [PrismaModule, DataModule],
  controllers: [RecurringMessagesController],
  providers: [RecurringMessagesService, DataService],
})
export class RecurringMessagesModule {}
