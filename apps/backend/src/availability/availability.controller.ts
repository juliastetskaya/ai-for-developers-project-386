import { Controller, Get, Query } from '@nestjs/common';
import type { Slot } from '../slots/slots.js';
import { AvailabilityService } from './availability.service.js';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Slot[] {
    return this.availability.listFreeSlots(query);
  }
}
