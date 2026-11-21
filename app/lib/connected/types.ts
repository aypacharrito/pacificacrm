export const providers = ['google', 'microsoft', 'icloud'] as const;
export type Provider = typeof providers[number];
export const providerNames: Record<Provider, string> = {google: 'Google', microsoft: 'Microsoft', icloud: 'iCloud'};

export type Owner = {workspace: string; member: string};
export type Services = {mail: boolean; calendar: boolean; mailWrite: boolean};
export type Identity = {subject: string; tenant: string; email: string; name: string};
export type Credentials = {secret: string; scopes: string[]; access?: string; expires?: number; login?: string};
export type Resource = {id: string; name: string; path?: string; parent?: string; kind: 'folder' | 'label' | 'category'; special?: string};
export type Calendar = {id: string; name: string; primary?: boolean; color?: string; busyOnly?: boolean; timezone?: string; viewPrivate?: boolean};
export type CalendarChoice = {visible: boolean; color?: string};
export type AccountState = 'connected' | 'syncing' | 'limited' | 'reconnect' | 'unavailable';
export type Account = {
  id: string; provider: Provider; email: string; name: string; enabled: Services; granted: Services;
  state: AccountState; lastSync?: number; mailSync?: number; calendarSync?: number; retryAt?: number;
  folders: Resource[]; calendars: Calendar[]; calendarChoices: Record<string, CalendarChoice>; updates?: string;
};
export type Grant = Account & {
  owner: Owner; identity: Identity; credentials: Credentials; version: string; since: number;
};

export const mailViews = ['all', 'starred', 'updates', 'inbox', 'unread', 'sent', 'archive', 'drafts', 'junk', 'trash', 'folder'] as const;
export type MailView = typeof mailViews[number];
export type MailAction = 'star' | 'unstar' | 'read' | 'unread' | 'archive' | 'move' | 'trash';
export type MailQuery = {
  view: MailView; folder?: string; keyword?: string; from?: string; subject?: string;
  start?: string; end?: string; before?: number; after?: number; attachments?: boolean;
};
export type Message = {
  id: string; thread: string; sender: string; recipients: string[]; subject: string; at: number;
  preview: string; unread: boolean; starred: boolean; flag?: string; important?: boolean;
  folders: string[]; excluded?: 'drafts' | 'junk' | 'trash'; inbox: boolean; sent: boolean;
  hasAttachments: boolean; link?: string;
};
export type Attachment = {id: string; name: string; size?: number};
export type Detail = Message & {text: string; attachments: Attachment[]; related: Message[]};
export type MailRow = Message & {connection: string; source: string; account: string; provider: Provider};
export type MailDetail = Omit<Detail, 'related' | 'attachments'> & MailRow & {related: MailRow[]; attachments: Array<Attachment & {download: string}>};
export type Event = {
  id: string; calendar: string; title: string; start: string; end: string; allDay?: boolean;
  timezone?: string; location?: string; meeting?: string; link?: string; privacy?: string;
  crmId?: string; busyOnly?: boolean;
};
export type CalendarEvent = Event & {connection: string; source: string; account: string; calendarName: string; provider: Provider; color?: string};
export type Preferences = {view: MailView; selected: string[]; folder?: string};
export type MailPage = {rows: Message[]; next?: string; anchor?: string; partial?: boolean};
export type EventPage = {rows: Event[]; next?: string; partial?: boolean};
export type Changes = {rows: Message[]; removed: string[]; next?: string; anchor?: string; reset?: boolean};
export type CalendarChanges = EventPage & {removed?: string[]; anchor?: string; reset?: boolean};

export type Client = {
  discoverMail(): Promise<Resource[]>;
  discoverCalendars(): Promise<Calendar[]>;
  mail(query: MailQuery, page?: string): Promise<MailPage>;
  changes?(anchor: string, page?: string): Promise<Changes>;
  watch?(topic: string): Promise<number>;
  read(id: string): Promise<Detail>;
  attachment(message: string, id: string): Promise<{name?: string; content: Uint8Array}>;
  actions: MailAction[];
  write?(id: string, action: MailAction, folder?: string): Promise<Message | null>;
  events(calendar: Calendar, start: string, end: string, page?: string): Promise<EventPage>;
  calendarChanges?(calendar: Calendar, start: string, end: string, anchor?: string, page?: string): Promise<CalendarChanges>;
};

export class ConnectedError extends Error {
  constructor(readonly status: number, message: string, readonly retryAt?: number) { super(message); }
}

export const defaultPreferences: Preferences = {view: 'starred', selected: []};
export const maxAttachment = 12 * 1024 * 1024;
