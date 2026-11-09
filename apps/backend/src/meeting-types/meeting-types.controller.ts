import { Body, Controller, Get, Post } from '@nestjs/common';
import type { MeetingType } from './meeting-type.js';
import { MeetingTypesService } from './meeting-types.service.js';

@Controller('meeting-types')
export class MeetingTypesController {
  constructor(private readonly meetingTypes: MeetingTypesService) {}

  @Get()
  list(): MeetingType[] {
    return this.meetingTypes.list();
  }

  @Post()
  create(@Body() body: unknown): MeetingType {
    return this.meetingTypes.create(body);
  }
}
