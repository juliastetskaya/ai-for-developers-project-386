import { Module } from '@nestjs/common';
import { MeetingTypesController } from './meeting-types.controller.js';
import { MeetingTypesRepository } from './meeting-types.repository.js';
import { MeetingTypesService } from './meeting-types.service.js';

@Module({
  controllers: [MeetingTypesController],
  providers: [MeetingTypesService, MeetingTypesRepository],
  exports: [MeetingTypesService],
})
export class MeetingTypesModule {}
