import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RecurringMessagesService } from './recurring-messages.service';
import { CreateRecurringMessageDto } from './dto/create-recurring-message.dto';
import { UpdateRecurringMessageDto } from './dto/update-recurring-message.dto';

@Controller('recurring-messages')
export class RecurringMessagesController {
  constructor(private readonly recurringMessagesService: RecurringMessagesService) {}

  @Post()
  sendHourlyMessage() {
    return this.recurringMessagesService.sendMorningMessage();
  }

}
