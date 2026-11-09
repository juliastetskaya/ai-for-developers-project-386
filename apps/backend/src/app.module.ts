import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AvailabilityModule } from './availability/availability.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MeetingTypesModule } from './meeting-types/meeting-types.module.js';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    MeetingTypesModule,
    AvailabilityModule,
    BookingsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
