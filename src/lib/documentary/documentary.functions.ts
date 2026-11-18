// Authenticated wrappers for the long-form documentary steps (the work itself lives in documentary.server.ts, loaded only on the server).
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { documentaryRequest, type DocumentaryRequest } from './documentary-job';
import type { Dossier, Outline } from './long-script';

const deployment = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const text = (n: number) => z.string().max(n);
const dossierZ = z.object({
  facts: z.array(z.object({ fact: text(400), source: text(120), surprise: z.number() })).max(40), people: z.array(z.object({ name: text(80), motive: text(200) })).max(8),
  quotes: z.array(z.object({ text: text(300), who: text(80), source: text(120) })).max(6), angle: text(400),
});
const outlineZ = z.object({
  characters: z.array(z.object({ name: text(60), role: text(80), look: text(240) })).max(4),
  chapters: z.array(z.object({ title: text(80), question: text(300), escalation: text(300), facts: z.array(z.number().int()).max(10), words: z.number(), music: z.enum(['lofi', 'epic', 'suspense', 'sad']), reveal: z.boolean(), rehooks: z.array(text(200)).max(5) })).min(1).max(16),
  coldOpen: z.object({ moments: z.array(text(300)).max(5), stakes: text(300), promise: text(300) }), finalReframe: text(400), twistChapter: z.number().int(),
});

export const documentaryPackaging = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; facts: string; research: string; past: string[]; deployment: string }) => z.object({ topic: text(300).min(1), facts: text(5000), research: text(4000), past: z.array(text(200)).max(20), deployment }).parse(d))
  .handler(async ({ data }) => { const { packagingOperation } = await import('./documentary.server'); return packagingOperation({ data }); });

export const documentaryDossier = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; facts: string; research: string; deployment: string }) => z.object({ topic: text(300).min(1), facts: text(5000), research: text(4000), deployment }).parse(d))
  .handler(async ({ data }) => { const { dossierOperation } = await import('./documentary.server'); return dossierOperation({ data }); });

export const documentaryOutline = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; promise: string; title: string; hook: string; durationSec: number; dossier: Dossier; archetype: string; deployment: string }) =>
    z.object({ topic: text(300).min(1), promise: text(400), title: text(200), hook: text(400), durationSec: z.number().int().min(120).max(1800), dossier: dossierZ, archetype: text(300), deployment }).parse(d))
  .handler(async ({ data }) => { const { outlineOperation } = await import('./documentary.server'); return outlineOperation({ data }); });

export const documentaryChapter = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; title: string; index: number; outline: Outline; dossier: Dossier; style: string; priorLine: string; hook: string; first: boolean; deployment: string }) =>
    z.object({ topic: text(300).min(1), title: text(200), index: z.number().int().min(0).max(15), outline: outlineZ, dossier: dossierZ, style: text(600), priorLine: text(400), hook: text(400), first: z.boolean(), deployment }).parse(d))
  .handler(async ({ data }) => { const { chapterOperation } = await import('./documentary.server'); return chapterOperation({ data }); });

export const documentarySag = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { lines: { scene: number; text: string }[]; problems: string[]; deployment: string }) =>
    z.object({ lines: z.array(z.object({ scene: z.number().int().min(0).max(3000), text: text(600) })).min(1).max(60), problems: z.array(text(300)).max(20), deployment }).parse(d))
  .handler(async ({ data }) => { const { sagOperation } = await import('./documentary.server'); return sagOperation({ data }); });

export const documentaryColdOpen = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; title: string; outline: Outline; style: string; deployment: string }) => z.object({ topic: text(300).min(1), title: text(200), outline: outlineZ, style: text(600), deployment }).parse(d))
  .handler(async ({ data }) => { const { coldOpenOperation } = await import('./documentary.server'); return coldOpenOperation({ data }); });

export const documentaryVisuals = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { scenes: { index: number; text: string }[]; topic: string; sources: string[]; deployment: string }) =>
    z.object({ scenes: z.array(z.object({ index: z.number().int().min(0).max(3000), text: text(600) })).min(1).max(30), topic: text(300), sources: z.array(text(160)).max(10), deployment }).parse(d))
  .handler(async ({ data }) => { const { planVisualsOperation } = await import('./documentary.server'); return planVisualsOperation({ data }); });

export const submitDocumentary = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: DocumentaryRequest) => documentaryRequest.parse(d) as unknown as DocumentaryRequest)
  .handler(async ({ data, context }) => { const { submitDocumentaryOperation } = await import('./documentary-submit.server'); return submitDocumentaryOperation({ data, context }); });

/** True when the Azure fleet is configured for documentary renders (and not switched off with LONGFORM_DOCUMENTARY=off). */
export const documentaryEnabled = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .handler(async () => ({ enabled: process.env['LONGFORM_DOCUMENTARY'] !== 'off' && Boolean(process.env['AZURE_RENDER_IMAGE'] && process.env['AZURE_CLIENT_ID'] && process.env['AZURE_BLOB_BASE']) }));
