import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { Booking } from './booking.js';
import { BookingsService } from './bookings.service.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Booking[] {
    return this.bookings.listUpcoming(query);
  }

  @Post()
  create(@Body() body: unknown): Booking {
    return this.bookings.create(body);
  }
}
