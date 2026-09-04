import { JSDOM, VirtualConsole } from 'jsdom';
import {
   applicabilityInputSchema,
   type ApplicabilityElement,
   type ApplicabilityInput,
   type ApplicabilitySignal,
} from '@a11ied/contracts';

const MAX_ELEMENTS_PER_SIGNAL = 10;
const MAX_SNIPPET_LENGTH = 120;

interface SignalDetector {
   category: ApplicabilitySignal['category'];
   source: ApplicabilitySignal['source'];
   value: string;
   confidence: ApplicabilitySignal['confidence'];
   selector?: string;
   /** Tested against an element's opening tag plus the text it holds directly. */
   pattern?: RegExp;
}

const LANDMARK_ROLES = ['main', 'navigation', 'banner', 'contentinfo', 'complementary'];
const WIDGET_ROLES = [
   'button',
   'link',
   'switch',
   'slider',
   'combobox',
   'listbox',
   'tree',
];

function roleSelector(roles: string[]): string {
   return roles.map((role) => `[role="${role}"]`).join(', ');
}

const domDetectors: readonly SignalDetector[] = [
   {
      category: 'landmark',
      source: 'dom',
      value: 'landmark structure',
      confidence: 'high',
      selector: `main, nav, header, footer, aside, ${roleSelector(LANDMARK_ROLES)}`,
   },
   {
      category: 'heading',
      source: 'dom',
      value: 'heading structure',
      confidence: 'high',
      selector: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
   },
   {
      category: 'form',
      source: 'dom',
      value: 'form controls',
      confidence: 'high',
      selector: 'form, input, select, textarea',
   },
   {
      category: 'auth',
      source: 'dom',
      value: 'authentication flow',
      confidence: 'high',
      selector:
         'input[type="password"], [autocomplete="current-password"], [autocomplete="new-password"], [autocomplete="username"]',
      pattern: /\b(log in|login|sign in|password recovery|two-factor|otp)\b/i,
   },
   {
      category: 'live-region',
      source: 'dom',
      value: 'aria-live region',
      confidence: 'high',
      selector: '[aria-live]:not([aria-live=""])',
   },
   {
      category: 'live-region',
      source: 'a11y-tree',
      value: 'role=status',
      confidence: 'high',
      selector: '[role="status"]',
   },
   {
      category: 'live-region',
      source: 'a11y-tree',
      value: 'alert or log role',
      confidence: 'medium',
      selector: roleSelector(['alert', 'log']),
   },
   {
      category: 'dialog',
      source: 'dom',
      value: 'dialog structure',
      confidence: 'high',
      selector: `${roleSelector(['dialog', 'alertdialog'])}, [aria-modal="true"]`,
   },
   {
      category: 'overlay',
      source: 'dom',
      value: 'fixed or modal overlay',
      confidence: 'medium',
      pattern: /\b(modal|overlay)\b|position\s*:\s*(fixed|sticky)/i,
   },
   {
      category: 'media',
      source: 'dom',
      value: 'audio or video media',
      confidence: 'high',
      selector: 'video, audio',
   },
   {
      category: 'drag-and-drop',
      source: 'dom',
      value: 'drag-and-drop interaction',
      confidence: 'medium',
      pattern: /\b(draggable|drag|drop)\b/i,
   },
   {
      category: 'menu',
      source: 'dom',
      value: 'menu structure',
      confidence: 'medium',
      selector: roleSelector(['menu', 'menubar', 'menuitem']),
      pattern: /\b(menu|menubar)\b/i,
   },
   {
      category: 'tablist',
      source: 'dom',
      value: 'tablist structure',
      confidence: 'medium',
      selector: '[role="tablist"]',
   },
   {
      category: 'validation',
      source: 'dom',
      value: 'validation messaging',
      confidence: 'medium',
      selector: '[aria-invalid="true"]',
      pattern: /\b(error|invalid|required field|validation)\b/i,
   },
   {
      category: 'widget',
      source: 'dom',
      value: 'focusable widget',
      confidence: 'medium',
      selector: `[tabindex="0"], ${roleSelector(WIDGET_ROLES)}`,
   },
];

function buildOpeningTag(element: Element): string {
   const attributes = [...element.attributes]
      .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
      .join('');
   return `<${element.localName}${attributes}>`;
}

function buildOwnText(element: Element): string {
   return [...element.childNodes]
      .filter((node) => node.nodeType === node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ');
}

function buildXPathSegment(element: Element): string {
   const name = element.localName;
   const parent = element.parentElement;
   if (!parent) {
      return name;
   }

   const sameTagSiblings = [...parent.children].filter(
      (sibling) => sibling.localName === name,
   );
   if (sameTagSiblings.length === 1) {
      return name;
   }
   return `${name}[${sameTagSiblings.indexOf(element) + 1}]`;
}

function buildXPath(element: Element): string {
   const segments: string[] = [];
   let current: Element | null = element;

   while (current) {
      segments.unshift(buildXPathSegment(current));
      current = current.parentElement;
   }

   return `/${segments.join('/')}`;
}

function buildSnippet(openingTag: string): string {
   const singleLine = openingTag.replaceAll(/\s+/g, ' ');
   if (singleLine.length <= MAX_SNIPPET_LENGTH) {
      return singleLine;
   }
   return `${singleLine.slice(0, MAX_SNIPPET_LENGTH)}...`;
}

function toApplicabilityElement(
   element: Element,
   openingTag: string,
): ApplicabilityElement {
   return {
      xpath: buildXPath(element),
      tag: element.localName,
      snippet: buildSnippet(openingTag),
   };
}

function matchesDetector(
   detector: SignalDetector,
   element: Element,
   surface: string,
): boolean {
   if (detector.selector && element.matches(detector.selector)) {
      return true;
   }
   return detector.pattern !== undefined && detector.pattern.test(surface);
}

function detectDomSignals(html: string): ApplicabilitySignal[] {
   const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
   const matches = new Map<SignalDetector, ApplicabilityElement[]>();

   for (const element of dom.window.document.querySelectorAll('*')) {
      const openingTag = buildOpeningTag(element);
      const surface = `${openingTag} ${buildOwnText(element)}`;
      for (const detector of domDetectors) {
         if (!matchesDetector(detector, element, surface)) {
            continue;
         }
         const elements = matches.get(detector) ?? [];
         if (elements.length < MAX_ELEMENTS_PER_SIGNAL) {
            elements.push(toApplicabilityElement(element, openingTag));
         }
         matches.set(detector, elements);
      }
   }

   return domDetectors
      .filter((detector) => matches.has(detector))
      .map((detector) => ({
         category: detector.category,
         source: detector.source,
         value: detector.value,
         confidence: detector.confidence,
         elements: matches.get(detector) ?? [],
      }));
}

function resolveHintSource(userHints: string[] | undefined): 'user-hint' | 'metadata' {
   if (userHints?.length) {
      return 'user-hint';
   }
   return 'metadata';
}

function detectHintBasedSignals(
   hintValues: string,
   userHints: string[] | undefined,
): ApplicabilitySignal[] {
   const source = resolveHintSource(userHints);
   const signals: ApplicabilitySignal[] = [];

   if (/\b(auth|login|sign in|sign-in|password|credential)\b/i.test(hintValues)) {
      signals.push({
         category: 'auth',
         source,
         value: 'story metadata hints at an authentication flow',
         confidence: 'high',
      });
   }

   if (/\b(status|toast|notification|live region|status update)\b/i.test(hintValues)) {
      signals.push({
         category: 'live-region',
         source,
         value: 'story metadata hints at a status message',
         confidence: 'medium',
      });
   }

   if (/\b(dialog|modal|confirm|overlay)\b/i.test(hintValues)) {
      signals.push({
         category: 'dialog',
         source,
         value: 'story metadata hints at a dialog workflow',
         confidence: 'medium',
      });
   }

   return signals;
}

function buildHintValues(options?: {
   userHints?: string[];
   metadata?: Record<string, string>;
}): string {
   return [
      ...(options?.userHints ?? []),
      ...Object.entries(options?.metadata ?? {}).map(([key, value]) => `${key}:${value}`),
   ].join(' ');
}

export function deriveApplicabilityInputFromHtml(
   url: string,
   html: string,
   options?: {
      target?: ApplicabilityInput['target'];
      metadata?: Record<string, string>;
      userHints?: string[];
   },
): ApplicabilityInput {
   const signals = [
      ...detectDomSignals(html),
      ...detectHintBasedSignals(buildHintValues(options), options?.userHints),
   ];

   return applicabilityInputSchema.parse({
      target: options?.target ?? {
         kind: 'url',
         value: url,
      },
      signals,
      metadata: options?.metadata ?? {},
      userHints: options?.userHints ?? [],
   });
}
