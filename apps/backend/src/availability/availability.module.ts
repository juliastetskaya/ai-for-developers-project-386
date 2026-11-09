import { Module } from '@nestjs/common';
import { MeetingTypesModule } from '../meeting-types/meeting-types.module.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityRepository } from './availability.repository.js';
import { AvailabilityService } from './availability.service.js';

@Module({
  imports: [MeetingTypesModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, AvailabilityRepository],
})
export class AvailabilityModule {}
