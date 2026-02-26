export type CalendarDay = {
  text: string;
  messages?: string[];
  hoverPhrases?: string[];
};

export type CalendarMonth = Record<string, CalendarDay>;

export type EmailRecord = {
  id: string;
  sourcePath: string;
  unlockAtUtc: string;
  dateHeaderRaw: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toName: string | null;
  toAddress: string | null;
  subject: string | null;
  bodyText: string;
  rawHeaders: Record<string, string>;
};

export type CalendarEntry = {
  monthKey: string;
  data: CalendarMonth;
};

export type EmailViewRecord = EmailRecord & {
  isUnlocked: boolean;
};
