import { Body, Controller, Post } from '@nestjs/common';
import type { Booking } from './booking.js';
import { BookingsService } from './bookings.service.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(@Body() body: unknown): Booking {
    return this.bookings.create(body);
  }
}
