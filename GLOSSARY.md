# Call Calendar

A simplified cal.com-like booking service: a single predefined calendar owner publishes meeting types, guests book time slots without registration. Domain language is English; UI strings are English too.

## Roles

**Guest**:
A visitor who books a meeting without any registration or account.
_Avoid_: user, client, visitor, customer

**Calendar Owner**:
The single, predefined person who owns the calendar. Creates Meeting Types and views upcoming Bookings.
_Avoid_: admin, host, manager

## Core Domain

**Meeting Type**:
A bookable kind of meeting defined by the Calendar Owner: a name, an optional description, and a duration in minutes (e.g. 15/30/60).
_Avoid_: event type, meeting kind, appointment type

**Booking**:
A confirmed reservation of a concrete time interval, made by a Guest for a specific Meeting Type. Any time overlap with any Booking (of any Meeting Type) blocks that interval globally.
_Avoid_: appointment, reservation, meeting

**Working Window**:
The fixed daily hours (e.g. 9:00–18:00) during which the Calendar Owner accepts Bookings. Slots are sliced only inside this window.
_Avoid_: working hours, availability, schedule

**Slot**:
A bookable start time inside the Working Window, sliced according to the chosen Meeting Type's duration. A Slot is free when its interval does not overlap any existing Booking.
_Avoid_: time slot, availability slot

## Pages

**Landing**:
The public page at `/` that describes the service and leads guests to the Booking Page.
_Avoid_: home page, main page, index page

**Booking Page**:
The public page at `/book` where the Guest flow starts: picking a Meeting Type, then a day, then a Slot.
_Avoid_: public page, booking flow, main page

**Owner Dashboard**:
The management page where the Calendar Owner manages Meeting Types and sees all upcoming Bookings.
_Avoid_: admin panel, home page, main page
