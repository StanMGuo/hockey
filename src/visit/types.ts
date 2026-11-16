export const SCREENS = ['gate', 'home', 'play', 'sheet'] as const;
export type Screen = (typeof SCREENS)[number];

export const VISIT_MODES = ['learn', 'help', 'test', 'game'] as const;
export type VisitMode = (typeof VISIT_MODES)[number] | null;

export const SHEETS = ['how', 'settings', 'practice-pick', 'game-pick', 'other'] as const;
export type VisitSheet = (typeof SHEETS)[number];

export const KINDS = ['beat', 'end'] as const;
export type VisitKind = (typeof KINDS)[number];

export type SpanIdentity = {
  screen: Screen;
  mode: VisitMode;
  scenarioId: string | null;
  sheet: VisitSheet | null;
};

export type VisitSnapshot = SpanIdentity;

export type VisitBody = SpanIdentity & {
  visitorId: string;
  sessionId: string;
  kind: VisitKind;
};
