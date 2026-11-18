import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, LONG_DEFAULT_STYLE, STYLES, styleAnchor } from '@/lib/styles';
import { BACKGROUND_RULE, cutoutPrompts } from '@/lib/documentary/cast';

describe('long-form picture style', () => {
  it('long-form opens on the flat 2D history cartoon, Shorts keep their own default', () => {
    expect(LONG_DEFAULT_STYLE).toBe('Flat 2D history cartoon');
    expect(STYLES).toContain(LONG_DEFAULT_STYLE);
    expect(DEFAULT_STYLE).toBe('3D animated cartoon');
    expect(LONG_DEFAULT_STYLE).not.toBe('Ink explainer');
  });

  it('the anchor asks for flat, human, period-dressed staged scenes and refuses 3D, stick figures and lettering', () => {
    const a = styleAnchor(LONG_DEFAULT_STYLE);
    expect(a).toMatch(/Flat 2D/);
    expect(a).toMatch(/period clothing/);
    expect(a).toMatch(/Not photoreal, not 3D, not a stick figure/);
    expect(a).toMatch(/no text/);
  });

  it('cutouts are drawn in the same flat style as the pictures, and the pictures leave room for them', () => {
    const p = cutoutPrompts({ id: 's', name: 'Soldier', kind: 'role', label: 'Soldier', look: 'a soldier in a helmet' }, 'ancient', styleAnchor(LONG_DEFAULT_STYLE));
    expect(p[0]).toMatch(/Flat 2D/);
    expect(p[0]).toMatch(/transparent background/);
    expect(BACKGROUND_RULE).toMatch(/lower left and lower right/);
    expect(BACKGROUND_RULE).toMatch(/animated history explainer/);
  });
});
