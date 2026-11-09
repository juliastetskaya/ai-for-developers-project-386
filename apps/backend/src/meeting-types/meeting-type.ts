export interface MeetingType {
  id: number;
  name: string;
  description: string | null;
  durationMin: number;
  /** UTC ISO-8601 timestamp. */
  createdAt: string;
}

export interface CreateMeetingTypeInput {
  name: string;
  description: string | null;
  durationMin: number;
}
