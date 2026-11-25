/** The elements of the playground page that its script reads and updates. */
export interface Parts {
   readonly root: HTMLElement;
   readonly caseButtons: readonly HTMLButtonElement[];
   readonly filter: HTMLInputElement;
   readonly jumpSelect: HTMLSelectElement;
   readonly urlInput: HTMLInputElement;
   readonly frame: HTMLIFrameElement;
   readonly cursor: HTMLElement;
   readonly log: HTMLElement;
   readonly commands: HTMLElement;
   readonly checkList: HTMLElement;
   readonly rowTemplate: HTMLTemplateElement;
   readonly checkTemplate: HTMLTemplateElement;
}

export function findParts(): Parts | undefined {
   const root = document.querySelector('[data-playground]');

   if (!(root instanceof HTMLElement)) {
      return undefined;
   }
   const caseButtons = [...root.querySelectorAll('[data-pg-case-button]')].filter(
      (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
   );
   const checkList = root.querySelector('[data-pg-check-list]'),
      checkTemplate = root.querySelector('[data-pg-check-template]'),
      commands = root.querySelector('[data-pg-commands]'),
      cursor = root.querySelector('[data-pg-cursor]'),
      filter = root.querySelector('[data-pg-filter]'),
      frame = root.querySelector('[data-pg-frame]'),
      jumpSelect = root.querySelector('[data-pg-jump]'),
      log = root.querySelector('[data-pg-log]'),
      rowTemplate = root.querySelector('[data-pg-row-template]'),
      urlInput = root.querySelector('[data-pg-url-input]');

   if (
      !(filter instanceof HTMLInputElement) ||
      !(urlInput instanceof HTMLInputElement) ||
      !(jumpSelect instanceof HTMLSelectElement) ||
      !(frame instanceof HTMLIFrameElement) ||
      !(cursor instanceof HTMLElement) ||
      !(log instanceof HTMLElement) ||
      !(commands instanceof HTMLElement) ||
      !(checkList instanceof HTMLElement) ||
      !(rowTemplate instanceof HTMLTemplateElement) ||
      !(checkTemplate instanceof HTMLTemplateElement)
   ) {
      return undefined;
   }
   return {
      root,
      caseButtons,
      filter,
      jumpSelect,
      urlInput,
      frame,
      cursor,
      log,
      commands,
      checkList,
      rowTemplate,
      checkTemplate,
   };
}

export function setText(parts: Parts, selector: string, text: string): void {
   const element = parts.root.querySelector(selector);

   if (element) {
      element.textContent = text;
   }
}

export function setShown(parts: Parts, selector: string, isShown: boolean): void {
   const element = parts.root.querySelector(selector);

   if (element instanceof HTMLElement) {
      element.hidden = !isShown;
   }
}
