import { z } from 'zod';

export const AUTOMATION_TIMEZONE = 'Europe/London';
export const GENERATION_LEAD_MS = 60 * 60 * 1000;
export const automationConfig = z.object({
  workspaceId: z.string().uuid(), enabled: z.boolean(),
  formats: z.array(z.enum(['short', 'long'])).min(1).max(2).refine(v => new Set(v).size === v.length),
  shortTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  longTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  shortSeconds: z.number().int().min(15).max(90),
  longSeconds: z.number().int().min(180).max(1200),
  focus: z.string().max(200),
});
export type AutomationConfig = z.infer<typeof automationConfig>;
export const defaultAutomation = {
  enabled: false, formats: ['short'] as ('short' | 'long')[], shortTime: '18:00', longTime: '18:00',
  shortSeconds: 60, longSeconds: 600, focus: '',
};

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: AUTOMATION_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function londonParts(ms: number) {
  const p = Object.fromEntries(clock.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p['year']}-${p['month']}-${p['day']}`, time: `${p['hour']}:${p['minute']}` };
}
/** First occurrence of a repeated UK clock time; spring-gap times move forward one hour. */
export function londonInstant(date: string, time: string): number {
  const nominal = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(nominal)) throw Error('Invalid posting time');
  const matches = [nominal - GENERATION_LEAD_MS, nominal, nominal + GENERATION_LEAD_MS].filter(ms => {
    const p = londonParts(ms); return p.date === date && p.time === time;
  });
  return matches.length ? Math.min(...matches) : nominal;
}
export type AutomationSlot = { format: 'short' | 'long'; localDate: string; publishAt: string; generateAt: string };
export function automationSlots(config: Pick<AutomationConfig, 'formats' | 'shortTime' | 'longTime'>, now: number): AutomationSlot[] {
  const today = londonParts(now).date;
  return [0, 1].flatMap(day => {
    const localDate = new Date(Date.parse(`${today}T12:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
    return config.formats.map(format => {
      const publish = londonInstant(localDate, format === 'short' ? config.shortTime : config.longTime);
      return { format, localDate, publishAt: new Date(publish).toISOString(), generateAt: new Date(publish - GENERATION_LEAD_MS).toISOString() };
    });
  });
}
export function nextAutomationSlots(config: Pick<AutomationConfig, 'formats' | 'shortTime' | 'longTime'>, now: number) {
  return config.formats.flatMap(format => {
    const next = automationSlots(config, now).find(s => s.format === format && Date.parse(s.generateAt) > now);
    return next ? [next] : [];
  });
}
export function dueAutomationSlots(config: Pick<AutomationConfig, 'enabled' | 'formats' | 'shortTime' | 'longTime'>, now: number) {
  if (!config.enabled) return [];
  return automationSlots(config, now).filter(s => Date.parse(s.generateAt) <= now && now < Date.parse(s.generateAt) + 10 * 60000 && now < Date.parse(s.publishAt));
}
export function automationEngine(format: 'short' | 'long') { return format === 'short' ? 'advanced' as const : 'own' as const; }
export function youtubeScheduledStatus(publishAt: string, now = Date.now()) {
  if (Date.parse(publishAt) <= now) throw Error('The posting time has passed; this video was not published late.');
  return { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false, containsSyntheticMedia: true };
}