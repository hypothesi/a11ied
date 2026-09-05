import type { DriverCurrentItem } from '@a11ied/contracts';
import { computeAccessibleName, getRole, isDisabled } from 'dom-accessibility-api';

import type { VirtualReader } from './virtual-reader.js';
import { getVirtualPhraseRole } from './virtual-position.js';

const VIRTUAL_ITEM_SOURCE =
   'virtual: role and name from the active node (dom-accessibility-api), states from its attributes';

const HEADING_TAG_PATTERN = /^H([1-6])$/u;

/** ARIA state attributes and the state word each value maps to. */
const ARIA_STATE_ATTRIBUTES: ReadonlyArray<
   [attribute: string, whenTrue: string, whenFalse?: string]
> = [
   ['aria-checked', 'checked', 'unchecked'],
   ['aria-pressed', 'pressed', 'not pressed'],
   ['aria-expanded', 'expanded', 'collapsed'],
   ['aria-selected', 'selected'],
   ['aria-required', 'required'],
   ['aria-readonly', 'read only'],
   ['aria-invalid', 'invalid'],
   ['aria-busy', 'busy'],
   ['aria-haspopup', 'has popup'],
   ['aria-current', 'current'],
];

function isElement(node: Node): node is Element {
   return node.nodeType === node.ELEMENT_NODE;
}

function isFormControl(element: Element): element is HTMLInputElement {
   return 'value' in element && typeof element.value === 'string';
}

function isSelectElement(element: Element): element is HTMLSelectElement {
   return element.tagName === 'SELECT' && 'selectedOptions' in element;
}

function readValue(element: Element): string | undefined {
   const ariaValue =
      element.getAttribute('aria-valuetext') ?? element.getAttribute('aria-valuenow');
   if (ariaValue !== null) {
      return ariaValue;
   }
   if (isSelectElement(element)) {
      return element.selectedOptions[0]?.textContent?.trim() ?? undefined;
   }
   if (
      isFormControl(element) &&
      element.type !== 'checkbox' &&
      element.type !== 'radio'
   ) {
      return element.value || undefined;
   }
   return undefined;
}

function readAriaStates(element: Element): string[] {
   return ARIA_STATE_ATTRIBUTES.flatMap(([attribute, whenTrue, whenFalse]) => {
      const value = element.getAttribute(attribute);
      if (value === null || value === 'undefined') {
         return [];
      }
      if (value === 'false' && whenFalse === undefined) {
         return [];
      }
      return [value === 'false' ? (whenFalse ?? '') : whenTrue];
   });
}

function readNativeStates(element: Element): string[] {
   const states: string[] = [];
   if (
      isFormControl(element) &&
      (element.type === 'checkbox' || element.type === 'radio')
   ) {
      states.push(element.checked ? 'checked' : 'unchecked');
   }
   if (element.hasAttribute('required')) {
      states.push('required');
   }
   if (element.hasAttribute('readonly')) {
      states.push('read only');
   }
   if (isDisabled(element)) {
      states.push('disabled');
   }
   return states;
}

function readHeadingLevel(element: Element): number | undefined {
   const ariaLevel = element.getAttribute('aria-level');
   if (ariaLevel !== null) {
      return Number(ariaLevel);
   }
   const level = HEADING_TAG_PATTERN.exec(element.tagName)?.[1];
   return level === undefined ? undefined : Number(level);
}

function describeElement(element: Element, phrase: string): DriverCurrentItem {
   const item: DriverCurrentItem = {
      role: getRole(element) ?? getVirtualPhraseRole(phrase),
      states: [...new Set([...readNativeStates(element), ...readAriaStates(element)])],
      phrase,
      source: VIRTUAL_ITEM_SOURCE,
   };
   const level = readHeadingLevel(element),
      name = computeAccessibleName(element),
      value = readValue(element);
   if (name) {
      item.name = name;
   }
   if (value !== undefined) {
      item.value = value;
   }
   if (level !== undefined) {
      item.level = level;
   }
   return item;
}

/** Describes the node under the virtual cursor: role, name, value, states, and level. */
export async function readVirtualItem(
   virtual: VirtualReader,
): Promise<DriverCurrentItem> {
   const [phrase, itemText] = await Promise.all([
      virtual.lastSpokenPhrase().catch(() => ''),
      virtual.itemText().catch(() => ''),
   ]);
   const node = virtual.activeNode;
   if (!node) {
      return { states: [], phrase, itemText, source: VIRTUAL_ITEM_SOURCE };
   }
   if (!isElement(node)) {
      const text = node.textContent?.trim() ?? '';
      return {
         role: 'text',
         name: text,
         states: [],
         phrase,
         itemText,
         source: VIRTUAL_ITEM_SOURCE,
      };
   }
   const item = describeElement(node, phrase);
   if (itemText) {
      item.itemText = itemText;
   }
   return item;
}
