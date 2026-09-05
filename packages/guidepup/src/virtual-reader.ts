import type { Virtual } from '@guidepup/virtual-screen-reader';

/** The Guidepup virtual screen reader instance, in jsdom or in a browser page. */
export type VirtualReader = Virtual;

/** The window whose document the virtual reader walks: jsdom's, or the page's own. */
export interface VirtualWindow {
   document: Document;
   MutationObserver?: typeof MutationObserver;
}
