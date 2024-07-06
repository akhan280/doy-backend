import { Module } from '@nestjs/common';
import { RecurringMessagesService } from './recurring-messages.service';
import { RecurringMessagesController } from './recurring-messages.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RecurringMessagesController],
  providers: [RecurringMessagesService],
})
export class RecurringMessagesModule {}
