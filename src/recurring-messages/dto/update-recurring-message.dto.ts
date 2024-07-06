import { PartialType } from '@nestjs/mapped-types';
import { CreateRecurringMessageDto } from './create-recurring-message.dto';

export class UpdateRecurringMessageDto extends PartialType(CreateRecurringMessageDto) {}
