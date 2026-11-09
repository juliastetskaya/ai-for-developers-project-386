import { Module } from '@nestjs/common';
import { MeetingTypesModule } from '../meeting-types/meeting-types.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsRepository } from './bookings.repository.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [MeetingTypesModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository],
})
export class BookingsModule {}
