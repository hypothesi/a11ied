import { escapeHtml } from '../report/html.js';
import type { Unit } from '../schema.js';

const MINUTES_PER_HOUR = 60;
const DATE_END = 10;
const TIME_START = 11;
const MINUTE_END = 16;
const SECOND_END = 19;

export const UNIT_LABELS: Readonly<Record<Unit['status'], string>> = {
   done: 'Done',
   claimed: 'Working',
   blocked: 'Blocked',
   pending: 'Queued',
};

/** The order the unit states are drawn in, from finished work to work not started. */
export const UNIT_STATUS_ORDER: readonly Unit['status'][] = [
   'done',
   'claimed',
   'blocked',
   'pending',
];

const ICON_PATHS = {
   done: '<path d="M3.5 8.5l3 3 6-7"/>',
   claimed:
      '<circle cx="8" cy="8" r="5.5"/><circle class="dash-icon-fill" cx="8" cy="8" r="2"/>',
   blocked: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.2v.3"/>',
   pending: '<circle cx="8" cy="8" r="5.5" stroke-dasharray="2.2 2.2"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Every icon is defined once here and referenced by `icon()`. */
export const ICON_SPRITE = [
   '<svg class="dash-sprite" aria-hidden="true">',
   ...Object.entries(ICON_PATHS).map(
      ([name, paths]) =>
         `<symbol id="dash-icon-${name}" viewBox="0 0 16 16">${paths}</symbol>`,
   ),
   '</svg>',
].join('');

/** A decorative icon. The text next to it states the same thing. */
export function icon(name: IconName): string {
   return `<svg class="dash-icon" aria-hidden="true" focusable="false"><use href="#dash-icon-${name}"/></svg>`;
}

export function formatMinutes(minutes: number): string {
   const hours = Math.floor(minutes / MINUTES_PER_HOUR);
   const rest = minutes % MINUTES_PER_HOUR;
   if (hours === 0) {
      return `${String(rest)} min`;
   }
   return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

/**
 * Renders a UTC timestamp. The live page's script rewrites it in the viewer's time zone;
 * a snapshot and a page without scripts keep the UTC text.
 */
export function renderTime(iso: string, form: 'time' | 'datetime'): string {
   const text =
      form === 'time'
         ? iso.slice(TIME_START, SECOND_END)
         : `${iso.slice(0, DATE_END)} ${iso.slice(TIME_START, MINUTE_END)} UTC`;
   return `<time datetime="${escapeHtml(iso)}" data-dash-time="${form}">${text}</time>`;
}

export interface SectionInput {
   /** Identifies the section to the live page's script and to links. */
   key: string;
   heading: string;
   body: string;
}

/**
 * Wraps one part of the page that the live page's script replaces when it changes. Every
 * section is always present, empty or not, so the script can match old to new by key.
 */
export function section({ key, heading, body }: SectionInput): string {
   if (body === '') {
      return `<div data-live="${key}" hidden></div>`;
   }
   return `<section class="dash-section" data-live="${key}" aria-labelledby="${key}"><h2 id="${key}">${escapeHtml(heading)}</h2>${body}</section>`;
}

export interface TableInput {
   /** The id of the heading that labels the table's scrollable region. */
   labelledBy: string;
   className?: string;
   head: readonly string[];
   rows: string;
   foot?: string;
}

/**
 * A table inside an area that scrolls sideways and can be scrolled from the keyboard. The
 * area is a group, not a region, because the section around it is already a landmark with
 * the same name.
 */
export function table({
   labelledBy,
   className = '',
   head,
   rows,
   foot = '',
}: TableInput): string {
   const columns = head.map((label) => `<th scope="col">${label}</th>`).join('');
   const footer = foot === '' ? '' : `<tfoot>${foot}</tfoot>`;
   return `<div class="dash-tableWrap" id="${labelledBy}-scroll" role="group" aria-labelledby="${labelledBy}" tabindex="0"><table class="${className}"><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody>${footer}</table></div>`;
}
