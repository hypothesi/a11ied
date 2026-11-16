// oxlint-disable id-length
import type { ContrastSample, ContrastStateSample } from '@a11ied/contracts';
import type { Page } from 'playwright';

export interface SampleContrastOptions {
   maxElements?: number;
   transitionSampleDelayMs?: number;
}

export interface RgbaColor {
   r: number;
   g: number;
   b: number;
   a: number;
}

const HEX_3 = 3;
const HEX_4 = 4;
const HEX_6 = 6;
const HEX_8 = 8;
const HEX_BASE = 16;
const CHANNEL_MAX = 255;
const PERCENT_DIVISOR = 100;
const OPAQUE_ALPHA = 1;
const TRANSPARENT_ALPHA = 0;

const SHORT_HEX_R = 0;
const SHORT_HEX_G = 1;
const SHORT_HEX_B = 2;
const SHORT_HEX_A = 3;

const HEX_OFFSET_RED = 0;
const HEX_OFFSET_GREEN = 2;
const HEX_OFFSET_BLUE = 4;
const HEX_OFFSET_ALPHA = 6;

const RGB_MATCH_R = 1;
const RGB_MATCH_G = 2;
const RGB_MATCH_B = 3;
const RGB_MATCH_A = 4;
const RGB_MATCH_PERCENT = 5;

const SRGB_CUTOFF = 0.040_45;
const LOW_DIVISOR = 12.92;
const EXPONENT = 2.4;
const OFFSET = 0.055;
const SCALE = 1.055;
const WEIGHT_R = 0.2126;
const WEIGHT_G = 0.7152;
const WEIGHT_B = 0.0722;

const RATIO_OFFSET = 0.05;
const ROUNDING_FACTOR = 100;
const DEFAULT_RATIO = 1;

const DEFAULT_MAX_ELEMENTS = 40;
const DEFAULT_TRANSITION_DELAY_MS = 50;
const HOVER_TIMEOUT_MS = 1000;
const MAX_TRANSITION_WAIT_MS = 200;

function parseShortHex(hex: string): RgbaColor | undefined {
   const r = Number.parseInt(
      (hex[SHORT_HEX_R] ?? '') + (hex[SHORT_HEX_R] ?? ''),
      HEX_BASE,
   );
   const g = Number.parseInt(
      (hex[SHORT_HEX_G] ?? '') + (hex[SHORT_HEX_G] ?? ''),
      HEX_BASE,
   );
   const b = Number.parseInt(
      (hex[SHORT_HEX_B] ?? '') + (hex[SHORT_HEX_B] ?? ''),
      HEX_BASE,
   );
   const a =
      hex.length === HEX_4
         ? Number.parseInt(
              (hex[SHORT_HEX_A] ?? '') + (hex[SHORT_HEX_A] ?? ''),
              HEX_BASE,
           ) / CHANNEL_MAX
         : OPAQUE_ALPHA;
   if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
      return undefined;
   }
   return { r, g, b, a };
}

function parseLongHex(hex: string): RgbaColor | undefined {
   const r = Number.parseInt(hex.slice(HEX_OFFSET_RED, HEX_OFFSET_GREEN), HEX_BASE);
   const g = Number.parseInt(hex.slice(HEX_OFFSET_GREEN, HEX_OFFSET_BLUE), HEX_BASE);
   const b = Number.parseInt(hex.slice(HEX_OFFSET_BLUE, HEX_OFFSET_ALPHA), HEX_BASE);
   const a =
      hex.length === HEX_8
         ? Number.parseInt(hex.slice(HEX_OFFSET_ALPHA, HEX_8), HEX_BASE) / CHANNEL_MAX
         : OPAQUE_ALPHA;
   if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
      return undefined;
   }
   return { r, g, b, a };
}

function parseRgbString(trimmed: string): RgbaColor | undefined {
   const rgbMatch = trimmed.match(
      /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/,
   );
   if (!rgbMatch) {
      return undefined;
   }
   const r = Math.min(
      CHANNEL_MAX,
      Math.max(0, Number.parseFloat(rgbMatch[RGB_MATCH_R] ?? '0')),
   );
   const g = Math.min(
      CHANNEL_MAX,
      Math.max(0, Number.parseFloat(rgbMatch[RGB_MATCH_G] ?? '0')),
   );
   const b = Math.min(
      CHANNEL_MAX,
      Math.max(0, Number.parseFloat(rgbMatch[RGB_MATCH_B] ?? '0')),
   );
   let a = OPAQUE_ALPHA;
   const alphaRaw = rgbMatch[RGB_MATCH_A];
   if (alphaRaw !== undefined) {
      const parsedA = Number.parseFloat(alphaRaw);
      a = rgbMatch[RGB_MATCH_PERCENT] === '%' ? parsedA / PERCENT_DIVISOR : parsedA;
      a = Math.min(OPAQUE_ALPHA, Math.max(0, a));
   }
   if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
      return undefined;
   }
   return { r, g, b, a };
}

export function parseCssColorToRgba(cssColor: string): RgbaColor | undefined {
   const trimmed = cssColor.trim().toLowerCase();
   if (trimmed.length === 0) {
      return undefined;
   }
   if (trimmed === 'transparent') {
      return { r: 0, g: 0, b: 0, a: TRANSPARENT_ALPHA };
   }
   if (trimmed === 'black') {
      return { r: 0, g: 0, b: 0, a: OPAQUE_ALPHA };
   }
   if (trimmed === 'white') {
      return { r: CHANNEL_MAX, g: CHANNEL_MAX, b: CHANNEL_MAX, a: OPAQUE_ALPHA };
   }
   if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === HEX_3 || hex.length === HEX_4) {
         return parseShortHex(hex);
      }
      if (hex.length === HEX_6 || hex.length === HEX_8) {
         return parseLongHex(hex);
      }
      return undefined;
   }
   return parseRgbString(trimmed);
}

export function computeRelativeLuminance(rgb: {
   r: number;
   g: number;
   b: number;
}): number {
   const linearize = (channel: number): number => {
      const srgb = channel / CHANNEL_MAX;
      return srgb <= SRGB_CUTOFF
         ? srgb / LOW_DIVISOR
         : ((srgb + OFFSET) / SCALE) ** EXPONENT;
   };
   const r = linearize(rgb.r);
   const g = linearize(rgb.g);
   const b = linearize(rgb.b);
   return WEIGHT_R * r + WEIGHT_G * g + WEIGHT_B * b;
}

export function computeContrastRatio(
   foregroundCss: string,
   backgroundCss: string,
): number {
   const fg = parseCssColorToRgba(foregroundCss);
   const bg = parseCssColorToRgba(backgroundCss);
   if (!fg || !bg) {
      return DEFAULT_RATIO;
   }
   const bgOpaque = {
      r: Math.round(bg.r * bg.a + CHANNEL_MAX * (1 - bg.a)),
      g: Math.round(bg.g * bg.a + CHANNEL_MAX * (1 - bg.a)),
      b: Math.round(bg.b * bg.a + CHANNEL_MAX * (1 - bg.a)),
   };
   const fgBlended = {
      r: Math.round(fg.r * fg.a + bgOpaque.r * (1 - fg.a)),
      g: Math.round(fg.g * fg.a + bgOpaque.g * (1 - fg.a)),
      b: Math.round(fg.b * fg.a + bgOpaque.b * (1 - fg.a)),
   };
   const l1 = computeRelativeLuminance(fgBlended);
   const l2 = computeRelativeLuminance(bgOpaque);
   const lighter = Math.max(l1, l2);
   const darker = Math.min(l1, l2);
   const ratio = (lighter + RATIO_OFFSET) / (darker + RATIO_OFFSET);
   return Math.round(ratio * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

interface CandidateSnapshot {
   selector: string;
   tag: string;
   text: string;
   role?: string;
   isLargeText: boolean;
   isUiComponent: boolean;
   hasTransition: boolean;
   transitionDurationMs: number;
   rest: {
      color: string;
      backgroundColor: string;
      outlineColor: string;
      outlineWidth: string;
      outlineStyle: string;
      boxShadow: string;
      borderTopColor: string;
      borderRightColor: string;
      borderBottomColor: string;
      borderLeftColor: string;
      borderTopWidth: string;
      parentSnapshot: string;
   };
}

interface FocusStyleData {
   color: string;
   backgroundColor: string;
   outlineColor: string;
   outlineWidth: string;
   outlineStyle: string;
   boxShadow: string;
   borderTopColor: string;
   borderRightColor: string;
   borderBottomColor: string;
   borderLeftColor: string;
   borderTopWidth: string;
   parentSnapshot: string;
}

function hasIndicatorChange(
   rest: CandidateSnapshot['rest'],
   focus: FocusStyleData | undefined,
): boolean {
   if (!focus) {
      return false;
   }
   const hasOutline =
      focus.outlineStyle !== 'none' &&
      Number.parseFloat(focus.outlineWidth) > 0 &&
      focus.outlineColor !== 'transparent' &&
      focus.outlineColor !== 'rgba(0, 0, 0, 0)';
   const outlineChanged =
      hasOutline &&
      (rest.outlineStyle === 'none' ||
         Number.parseFloat(rest.outlineWidth) === 0 ||
         focus.outlineColor !== rest.outlineColor ||
         focus.outlineWidth !== rest.outlineWidth ||
         focus.outlineStyle !== rest.outlineStyle);
   const shadowChanged = focus.boxShadow !== 'none' && focus.boxShadow !== rest.boxShadow;
   const borderChanged =
      focus.borderTopColor !== rest.borderTopColor ||
      focus.borderRightColor !== rest.borderRightColor ||
      focus.borderBottomColor !== rest.borderBottomColor ||
      focus.borderLeftColor !== rest.borderLeftColor ||
      focus.borderTopWidth !== rest.borderTopWidth;
   const bgChanged = focus.backgroundColor !== rest.backgroundColor;
   const colorChanged = focus.color !== rest.color;
   const parentChanged = focus.parentSnapshot !== rest.parentSnapshot;

   return (
      outlineChanged ||
      shadowChanged ||
      borderChanged ||
      bgChanged ||
      colorChanged ||
      parentChanged
   );
}

const EXTRACT_CANDIDATES_SCRIPT = `
(max) => {
   const selectorString = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
   const all = [...document.querySelectorAll(selectorString)].filter((el) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
         rect.width > 0 &&
         rect.height > 0 &&
         cs.visibility !== 'hidden' &&
         cs.display !== 'none' &&
         cs.opacity !== '0'
      );
   });

   const capped = all.slice(0, max);

   const getEffectiveBg = (el) => {
      let curr = el;
      while (curr && curr !== document.documentElement) {
         const b = getComputedStyle(curr).backgroundColor;
         if (b && b !== 'transparent' && b !== 'rgba(0, 0, 0, 0)') {
            return b;
         }
         curr = curr.parentElement;
      }
      const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
      if (htmlBg && htmlBg !== 'transparent' && htmlBg !== 'rgba(0, 0, 0, 0)') {
         return htmlBg;
      }
      return 'rgb(255, 255, 255)';
   };

   const getUniqueSelector = (el) => {
      if (el.id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(el.id) && document.querySelectorAll('#' + el.id).length === 1) {
         return '#' + el.id;
      }
      const path = [];
      let curr = el;
      while (curr && curr !== document.documentElement && curr !== document.body) {
         const tag = curr.tagName.toLowerCase();
         let index = 1;
         let sibling = curr.previousElementSibling;
         while (sibling) {
            if (sibling.tagName.toLowerCase() === tag) {
               index += 1;
            }
            sibling = sibling.previousElementSibling;
         }
         path.unshift(tag + ':nth-of-type(' + index + ')');
         curr = curr.parentElement;
      }
      return path.length > 0 ? 'body > ' + path.join(' > ') : el.tagName.toLowerCase();
   };

   const parseTransitionDuration = (duration) => {
      const parts = duration.split(',').map((p) => p.trim());
      let maxMs = 0;
      for (const part of parts) {
         if (part.endsWith('ms')) {
            const ms = parseFloat(part);
            if (!isNaN(ms) && ms > maxMs) {
               maxMs = ms;
            }
         } else if (part.endsWith('s')) {
            const s = parseFloat(part);
            if (!isNaN(s) && s * 1000 > maxMs) {
               maxMs = s * 1000;
            }
         }
      }
      return maxMs;
   };

   const getParentSnapshot = (el) => {
      const parts = [];
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
         const pc = getComputedStyle(p);
         parts.push([
            pc.outlineColor,
            pc.outlineWidth,
            pc.outlineStyle,
            pc.boxShadow,
            pc.borderTopColor,
            pc.borderRightColor,
            pc.borderBottomColor,
            pc.borderLeftColor,
            pc.backgroundColor,
         ].join(';'));
      }
      return parts.join('|');
   };

   return capped.map((el) => {
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize) || 16;
      const parsedWeight = parseInt(cs.fontWeight, 10);
      const isBold = cs.fontWeight === 'bold' || (!isNaN(parsedWeight) && parsedWeight >= 700);
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && isBold);
      const role = el.getAttribute('role') || undefined;
      const tag = el.tagName;
      const isUiComponent =
         ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag) ||
         ['button', 'tab', 'menuitem', 'switch', 'checkbox', 'radio'].includes(role || '') ||
         el.hasAttribute('tabindex');

      const transitionMs = parseTransitionDuration(cs.transitionDuration);

      return {
         selector: getUniqueSelector(el),
         tag,
         text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' '),
         role,
         isLargeText: isLarge,
         isUiComponent,
         hasTransition: transitionMs > 0,
         transitionDurationMs: transitionMs,
         rest: {
            color: cs.color,
            backgroundColor: getEffectiveBg(el),
            outlineColor: cs.outlineColor,
            outlineWidth: cs.outlineWidth,
            outlineStyle: cs.outlineStyle,
            boxShadow: cs.boxShadow,
            borderTopColor: cs.borderTopColor,
            borderRightColor: cs.borderRightColor,
            borderBottomColor: cs.borderBottomColor,
            borderLeftColor: cs.borderLeftColor,
            borderTopWidth: cs.borderTopWidth,
            parentSnapshot: getParentSnapshot(el),
         },
      };
   });
}
`;

const FOCUS_QUERY_SCRIPT = `
(sel) => {
   const el = document.querySelector(sel);
   if (!(el instanceof HTMLElement)) return undefined;
   const cs = getComputedStyle(el);
   let bg = 'rgb(255, 255, 255)';
   let curr = el;
   while (curr && curr !== document.documentElement) {
      const b = getComputedStyle(curr).backgroundColor;
      if (b && b !== 'transparent' && b !== 'rgba(0, 0, 0, 0)') {
         bg = b;
         break;
      }
      curr = curr.parentElement;
   }
   const parentParts = [];
   for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      parentParts.push([
         pc.outlineColor,
         pc.outlineWidth,
         pc.outlineStyle,
         pc.boxShadow,
         pc.borderTopColor,
         pc.borderRightColor,
         pc.borderBottomColor,
         pc.borderLeftColor,
         pc.backgroundColor,
      ].join(';'));
   }
   return {
      color: cs.color,
      backgroundColor: bg,
      outlineColor: cs.outlineColor,
      outlineWidth: cs.outlineWidth,
      outlineStyle: cs.outlineStyle,
      boxShadow: cs.boxShadow,
      borderTopColor: cs.borderTopColor,
      borderRightColor: cs.borderRightColor,
      borderBottomColor: cs.borderBottomColor,
      borderLeftColor: cs.borderLeftColor,
      borderTopWidth: cs.borderTopWidth,
      parentSnapshot: parentParts.join('|'),
   };
}
`;

const HOVER_QUERY_SCRIPT = `
(sel) => {
   const el = document.querySelector(sel);
   if (!el) return undefined;
   const cs = getComputedStyle(el);
   let bg = 'rgb(255, 255, 255)';
   let curr = el;
   while (curr && curr !== document.documentElement) {
      const b = getComputedStyle(curr).backgroundColor;
      if (b && b !== 'transparent' && b !== 'rgba(0, 0, 0, 0)') {
         bg = b;
         break;
      }
      curr = curr.parentElement;
   }
   return {
      color: cs.color,
      backgroundColor: bg,
      outlineColor: cs.outlineColor,
      borderTopColor: cs.borderTopColor,
   };
}
`;

const COLOR_QUERY_SCRIPT = `
(sel) => {
   const el = document.querySelector(sel);
   if (!el) return undefined;
   const cs = getComputedStyle(el);
   let bg = 'rgb(255, 255, 255)';
   let curr = el;
   while (curr && curr !== document.documentElement) {
      const b = getComputedStyle(curr).backgroundColor;
      if (b && b !== 'transparent' && b !== 'rgba(0, 0, 0, 0)') {
         bg = b;
         break;
      }
      curr = curr.parentElement;
   }
   return { color: cs.color, backgroundColor: bg };
}
`;

function blurActiveElement(): void {
   if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
   }
}

function dispatchHoverEvents(sel: string): void {
   const el = document.querySelector(sel);
   if (el) {
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
   }
}

function dispatchHoverLeave(sel: string): void {
   const el = document.querySelector(sel);
   if (el) {
      el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
   }
   if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
   }
}

async function sampleFocusState(
   page: Page,
   candidate: CandidateSnapshot,
): Promise<ContrastStateSample> {
   await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
         el.focus({ focusVisible: true });
      }
   }, candidate.selector);

   const focusData = await page.evaluate<FocusStyleData | undefined>(
      `(${FOCUS_QUERY_SCRIPT})(${JSON.stringify(candidate.selector)})`,
   );
   const hasVisibleIndicator = hasIndicatorChange(candidate.rest, focusData);
   const focusFg = focusData?.color ?? candidate.rest.color;
   const focusBg = focusData?.backgroundColor ?? candidate.rest.backgroundColor;
   const focusRatio = computeContrastRatio(focusFg, focusBg);

   await page.evaluate(blurActiveElement);

   return {
      state: 'focus-visible',
      foregroundColor: focusFg,
      backgroundColor: focusBg,
      outlineColor: focusData?.outlineColor ?? candidate.rest.outlineColor,
      borderColor: focusData?.borderTopColor ?? candidate.rest.borderTopColor,
      contrastRatio: focusRatio,
      hasVisibleIndicator,
   };
}

async function sampleHoverState(
   page: Page,
   candidate: CandidateSnapshot,
   delayMs: number,
): Promise<ContrastStateSample> {
   try {
      await page.hover(candidate.selector, { timeout: HOVER_TIMEOUT_MS });
   } catch {
      await page.evaluate(dispatchHoverEvents, candidate.selector);
   }

   let minTransitionRatio: number | undefined = undefined;
   if (candidate.hasTransition) {
      await page.waitForTimeout(delayMs);
      const intermediate = await page.evaluate<
         { color: string; backgroundColor: string } | undefined
      >(`(${COLOR_QUERY_SCRIPT})(${JSON.stringify(candidate.selector)})`);
      if (intermediate) {
         minTransitionRatio = computeContrastRatio(
            intermediate.color,
            intermediate.backgroundColor,
         );
      }
      const remainingWait = Math.min(
         MAX_TRANSITION_WAIT_MS,
         Math.max(0, candidate.transitionDurationMs - delayMs),
      );
      if (remainingWait > 0) {
         await page.waitForTimeout(remainingWait);
      }
   }

   const hoverData = await page.evaluate<
      | {
           color: string;
           backgroundColor: string;
           outlineColor: string;
           borderTopColor: string;
        }
      | undefined,
      string
   >(HOVER_QUERY_SCRIPT, candidate.selector);
   const hoverFg = hoverData?.color ?? candidate.rest.color;
   const hoverBg = hoverData?.backgroundColor ?? candidate.rest.backgroundColor;
   const hoverRatio = computeContrastRatio(hoverFg, hoverBg);
   const finalMin =
      minTransitionRatio === undefined
         ? hoverRatio
         : Math.min(hoverRatio, minTransitionRatio);

   try {
      await page.mouse.move(0, 0);
   } catch {
      // Ignore mouse move error
   }
   await page.evaluate(dispatchHoverLeave, candidate.selector);

   return {
      state: 'hover',
      foregroundColor: hoverFg,
      backgroundColor: hoverBg,
      outlineColor: hoverData?.outlineColor ?? candidate.rest.outlineColor,
      borderColor: hoverData?.borderTopColor ?? candidate.rest.borderTopColor,
      contrastRatio: hoverRatio,
      minTransitionContrastRatio: finalMin,
   };
}

export async function samplePageContrast(
   page: Page,
   options?: SampleContrastOptions,
): Promise<ContrastSample[]> {
   const maxElements = options?.maxElements ?? DEFAULT_MAX_ELEMENTS;
   const transitionDelay =
      options?.transitionSampleDelayMs ?? DEFAULT_TRANSITION_DELAY_MS;

   const candidates = await page.evaluate<CandidateSnapshot[]>(
      `(${EXTRACT_CANDIDATES_SCRIPT})(${maxElements})`,
   );
   const results: ContrastSample[] = [];

   for (const candidate of candidates) {
      const restRatio = computeContrastRatio(
         candidate.rest.color,
         candidate.rest.backgroundColor,
      );
      const restSample: ContrastStateSample = {
         state: 'rest',
         foregroundColor: candidate.rest.color,
         backgroundColor: candidate.rest.backgroundColor,
         outlineColor: candidate.rest.outlineColor,
         borderColor: candidate.rest.borderTopColor,
         contrastRatio: restRatio,
      };

      // oxlint-disable-next-line no-await-in-loop -- sequential focus testing
      const focusSample = await sampleFocusState(page, candidate);
      // oxlint-disable-next-line no-await-in-loop -- sequential hover testing
      const hoverSample = await sampleHoverState(page, candidate, transitionDelay);

      results.push({
         selector: candidate.selector,
         tag: candidate.tag,
         text: candidate.text,
         ...(candidate.role ? { role: candidate.role } : {}),
         isLargeText: candidate.isLargeText,
         isUiComponent: candidate.isUiComponent,
         samples: [restSample, focusSample, hoverSample],
      });
   }

   await page.evaluate(blurActiveElement);
   return results;
}
