import { describe, expect, it } from 'vitest';
import { automationConfig, automationEngine, automationRunAllowed, automationUploadTiming, defaultAutomation, dueAutomationSlots, londonInstant, nextAutomationSlots, youtubeScheduledStatus } from '@/lib/automation';

describe('daily video automation', () => {
  it('never gives a private verification upload a public posting time', () => {
    expect(automationUploadTiming(true, '2026-11-26T18:00:00Z')).toEqual({});
  });
  it('keeps the chosen publication time for normal daily uploads', () => {
    expect(automationUploadTiming(false, '2026-11-26T18:00:00Z')).toEqual({ publishAt: '2026-11-26T18:00:00Z' });
  });
  it('allows an explicitly approved private test without turning daily automation on', () => {
    expect(automationRunAllowed(true, false, null)).toBe(true);
    expect(automationRunAllowed(false, false, null)).toBe(false);
  });
  it('does not bypass paused workspace access during private verification', () => {
    expect(automationRunAllowed(true, false, 'Provider access denied')).toBe(false);
  });
  it('starts exactly one hour before the selected UK posting time', () => {
    const [slot] = dueAutomationSlots({ ...defaultAutomation, enabled: true }, Date.parse('2026-11-26T17:00:00Z'));
    expect(slot?.generateAt).toBe('2026-11-26T17:00:00.000Z');
    expect(slot?.publishAt).toBe('2026-11-26T18:00:00.000Z');
  });
  it('does not create videos when turned off', () => {
    expect(dueAutomationSlots(defaultAutomation, Date.parse('2026-11-26T17:00:00Z'))).toEqual([]);
  });
  it('supports both formats on the same day', () => {
    expect(dueAutomationSlots({ ...defaultAutomation, enabled: true, formats: ['short', 'long'] }, Date.parse('2026-11-26T17:00:00Z')).map(s => s.format)).toEqual(['short', 'long']);
  });
  it('uses British Summer Time, not fixed UTC', () => {
    expect(londonInstant('2027-07-01', '18:00')).toBe(Date.parse('2027-07-01T17:00:00Z'));
  });
  it('handles a posting time after midnight by creating the day before', () => {
    const [slot] = dueAutomationSlots({ ...defaultAutomation, enabled: true, shortTime: '00:30' }, Date.parse('2026-11-26T23:30:00Z'));
    expect(slot?.localDate).toBe('2026-11-27');
    expect(slot?.generateAt).toBe('2026-11-26T23:30:00.000Z');
  });
  it('runs once at the first repeated autumn clock time', () => {
    expect(londonInstant('2027-10-31', '01:30')).toBe(Date.parse('2027-10-31T00:30:00Z'));
  });
  it('moves a nonexistent spring clock time forward by one hour', () => {
    expect(londonInstant('2027-03-28', '01:30')).toBe(Date.parse('2027-03-28T01:30:00Z'));
  });
  it('never backfills missed days or starts an overdue generation', () => {
    expect(dueAutomationSlots({ ...defaultAutomation, enabled: true }, Date.parse('2026-11-26T18:00:00Z'))).toEqual([]);
  });
  it('does not rush a first video when enabled less than an hour before posting', () => {
    const [slot] = nextAutomationSlots(defaultAutomation, Date.parse('2026-11-26T17:30:00Z'));
    expect(slot?.publishAt).toBe('2026-11-27T18:00:00.000Z');
  });
  it('Shorts keep Advanced and long-form keeps Own images', () => {
    expect(automationEngine('short')).toBe('advanced'); expect(automationEngine('long')).toBe('own');
  });
  it('hands the exact future publication time to YouTube as a private scheduled upload', () => {
    expect(youtubeScheduledStatus('2026-11-26T18:00:00Z', Date.parse('2026-11-26T17:20:00Z'))).toEqual({ privacyStatus: 'private', publishAt: '2026-11-26T18:00:00Z', selfDeclaredMadeForKids: false, containsSyntheticMedia: true });
  });
  it('does not publish late videos immediately', () => {
    expect(() => youtubeScheduledStatus('2026-11-26T18:00:00Z', Date.parse('2026-11-26T18:01:00Z'))).toThrow('posting time has passed');
  });
  it('requires at least one format', () => {
    expect(automationConfig.safeParse({ ...defaultAutomation, workspaceId: 'e81a5b48-a970-4693-a6af-461be2c0d5cf', formats: [] }).success).toBe(false);
  });
});