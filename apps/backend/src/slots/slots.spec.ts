import {
  freeSlotsForDay,
  intervalsOverlap,
  isCalendarDate,
  ownerHorizon,
  sliceSlotsForDay,
} from './slots.js';

const DAY = '2026-11-10';
// Moscow is UTC+3 all year round: 09:00 MSK = 06:00Z, 18:00 MSK = 15:00Z.
const NOON_IN_THE_PAST = new Date('2026-11-01T00:00:00.000Z');

function starts(slots: { startAt: string }[]): string[] {
  return slots.map((slot) => slot.startAt);
}

/** Builds an interval from UTC clock times, e.g. `interval(DAY, '06:00', '06:30')`. */
function interval(
  date: string,
  start: string,
  end: string,
): { startAt: string; endAt: string } {
  return {
    startAt: `${date}T${start}:00.000Z`,
    endAt: `${date}T${end}:00.000Z`,
  };
}

describe('sliceSlotsForDay', () => {
  it.each([
    {
      durationMin: 30,
      expectedCount: 18,
      firstEnd: '2026-11-10T06:30:00.000Z',
      lastStart: '2026-11-10T14:30:00.000Z',
    },
    {
      durationMin: 15,
      expectedCount: 36,
      firstEnd: '2026-11-10T06:15:00.000Z',
      lastStart: '2026-11-10T14:45:00.000Z',
    },
    {
      durationMin: 60,
      expectedCount: 9,
      firstEnd: '2026-11-10T07:00:00.000Z',
      lastStart: '2026-11-10T14:00:00.000Z',
    },
  ])(
    'slices a $durationMin-minute grid from 09:00 that ends exactly at 18:00',
    ({ durationMin, expectedCount, firstEnd, lastStart }) => {
      const slots = sliceSlotsForDay({ date: DAY, durationMin });

      expect(slots).toHaveLength(expectedCount);
      expect(slots[0]).toEqual({
        startAt: '2026-11-10T06:00:00.000Z',
        endAt: firstEnd,
      });
      expect(slots.at(-1)).toEqual({
        startAt: lastStart,
        endAt: '2026-11-10T15:00:00.000Z',
      });
    },
  );

  it('keeps the grid ascending with the duration as the step', () => {
    const slots = sliceSlotsForDay({ date: DAY, durationMin: 30 });

    expect(starts(slots).slice(0, 4)).toEqual([
      '2026-11-10T06:00:00.000Z',
      '2026-11-10T06:30:00.000Z',
      '2026-11-10T07:00:00.000Z',
      '2026-11-10T07:30:00.000Z',
    ]);
  });

  it('yields no slots when the duration is longer than the working window', () => {
    expect(sliceSlotsForDay({ date: DAY, durationMin: 600 })).toEqual([]);
    expect(sliceSlotsForDay({ date: DAY, durationMin: 0 })).toEqual([]);
  });
});

describe('intervalsOverlap', () => {
  it.each([
    // Touching boundaries are not an overlap.
    { a: ['06:00', '06:30'], b: ['06:30', '07:00'], expected: false },
    { a: ['06:30', '07:00'], b: ['06:00', '06:30'], expected: false },
    // Partial overlap in both directions.
    { a: ['06:00', '06:30'], b: ['06:15', '06:45'], expected: true },
    { a: ['06:15', '06:45'], b: ['06:00', '06:30'], expected: true },
    // Contained and containing intervals.
    { a: ['06:00', '06:30'], b: ['06:10', '06:20'], expected: true },
    { a: ['06:10', '06:20'], b: ['06:00', '06:30'], expected: true },
    // Identical intervals.
    { a: ['06:00', '06:30'], b: ['06:00', '06:30'], expected: true },
    // Fully disjoint.
    { a: ['06:00', '06:30'], b: ['07:00', '07:30'], expected: false },
  ])('reports $a vs $b as $expected', ({ a, b, expected }) => {
    expect(
      intervalsOverlap(
        interval(DAY, a[0], a[1]),
        interval(DAY, b[0], b[1]),
      ),
    ).toBe(expected);
  });
});

describe('freeSlotsForDay', () => {
  it('excludes a slot that exactly matches a booking', () => {
    const slots = freeSlotsForDay({
      date: DAY,
      durationMin: 30,
      // 09:00-09:30 in Moscow.
      busy: [interval(DAY, '06:00', '06:30')],
      now: NOON_IN_THE_PAST,
    });

    expect(starts(slots)).not.toContain('2026-11-10T06:00:00.000Z');
  });

  it('keeps the slot that only touches the booking boundary', () => {
    const slots = freeSlotsForDay({
      date: DAY,
      durationMin: 30,
      busy: [interval(DAY, '06:00', '06:30')],
      now: NOON_IN_THE_PAST,
    });

    expect(starts(slots)).toContain('2026-11-10T06:30:00.000Z');
  });

  it('excludes a slot that partially overlaps a booking', () => {
    const slots = freeSlotsForDay({
      date: DAY,
      durationMin: 30,
      // 09:10-09:20 in Moscow.
      busy: [interval(DAY, '06:10', '06:20')],
      now: NOON_IN_THE_PAST,
    });

    expect(starts(slots)).not.toContain('2026-11-10T06:00:00.000Z');
    expect(starts(slots)).toContain('2026-11-10T06:30:00.000Z');
  });

  it('blocks every overlapping slot regardless of the booking duration or type', () => {
    const slots = freeSlotsForDay({
      date: DAY,
      durationMin: 15,
      // 10:00-11:00 in Moscow.
      busy: [interval(DAY, '07:00', '08:00')],
      now: NOON_IN_THE_PAST,
    });

    const blocked = [
      '2026-11-10T07:00:00.000Z', // 10:00
      '2026-11-10T07:15:00.000Z', // 10:15
      '2026-11-10T07:30:00.000Z', // 10:30
      '2026-11-10T07:45:00.000Z', // 10:45
    ];

    expect(starts(slots)).toEqual(expect.not.arrayContaining(blocked));
    expect(starts(slots)).toEqual(
      expect.arrayContaining([
        '2026-11-10T06:45:00.000Z', // 09:45 ends at 10:00
        '2026-11-10T08:00:00.000Z', // 11:00 starts at the booking end
      ]),
    );
  });

  it('drops slots that have already started today', () => {
    const slots = freeSlotsForDay({
      date: DAY,
      durationMin: 15,
      busy: [],
      now: new Date('2026-11-10T06:15:00.000Z'), // 09:15 in Moscow
    });

    expect(starts(slots)[0]).toBe('2026-11-10T06:30:00.000Z'); // 09:30
    expect(starts(slots)).not.toContain('2026-11-10T06:00:00.000Z'); // 09:00
    expect(starts(slots)).not.toContain('2026-11-10T06:15:00.000Z'); // 09:15
  });

  it('leaves future days unaffected by the current time', () => {
    const slots = freeSlotsForDay({
      date: '2026-11-11',
      durationMin: 30,
      busy: [],
      now: new Date('2026-11-10T15:00:00.000Z'), // late evening in Moscow
    });

    expect(slots).toHaveLength(18);
    expect(starts(slots)[0]).toBe('2026-11-11T06:00:00.000Z');
  });
});

describe('ownerHorizon', () => {
  it('starts today in the owner timezone and spans 14 calendar days', () => {
    // 22:30 UTC is already the next day in Moscow (UTC+3).
    expect(ownerHorizon(new Date('2026-11-09T22:30:00.000Z'))).toEqual({
      earliestDate: '2026-11-10',
      latestDate: '2026-11-23',
    });
  });

  it('uses the Moscow day even when UTC is still on the previous day', () => {
    expect(ownerHorizon(new Date('2026-11-09T20:00:00.000Z'))).toEqual({
      earliestDate: '2026-11-09',
      latestDate: '2026-11-22',
    });
  });
});

describe('isCalendarDate', () => {
  it.each(['2026-11-10', '2024-02-29'])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    '',
    '2026-11-10T00:00:00Z',
    '10.11.2026',
    '2026-02-30',
    '2026-13-01',
    '2026-1-1',
  ])('rejects %s', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});
