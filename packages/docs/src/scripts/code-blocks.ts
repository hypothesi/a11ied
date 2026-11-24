/**
 * Adds a label, a copy button, and syntax highlighting to every `pre > code` block the
 * docs shell renders. Output and agent prompts are prose, so they are left
 * unhighlighted.
 */

const TOKEN_PATTERN =
   /(https?:\/\/[^\s]+|--?[a-z][\w-]*|<[^>\n]+>|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:a1|a11ied|npm|npx|import|from|const|await)\b)/g;

const KEYWORD_PATTERN = /^(import|from|const|await)$/;

const COPY_RESET_MS = 1600;

const COPY_PREVIEW_LENGTH = 48;

const COPY_KINDS: Record<string, string> = {
   'AI AGENT PROMPT': 'prompt',
   CONFIG: 'config',
   OUTPUT: 'output',
};

const PLAIN_LABELS = new Set(['OUTPUT', 'AI AGENT PROMPT']);

const CLIPBOARD_PATHS = [
   'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
   'M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2Z',
];

function tokenClass(value: string): string {
   if (value.startsWith('http')) {
      return 'token-url';
   }
   if (value.startsWith('-')) {
      return 'token-option';
   }
   if (value.startsWith('<')) {
      return 'token-variable';
   }
   if (value.startsWith('"') || value.startsWith("'")) {
      return 'token-string';
   }
   if (KEYWORD_PATTERN.test(value)) {
      return 'token-keyword';
   }
   return 'token-command';
}

function highlight(code: Element, source: string): void {
   const fragment = document.createDocumentFragment();
   let cursor = 0;

   for (const match of source.matchAll(TOKEN_PATTERN)) {
      const index = match.index ?? 0;

      fragment.append(document.createTextNode(source.slice(cursor, index)));
      const token = document.createElement('span');

      token.className = tokenClass(match[0]);
      token.textContent = match[0];
      fragment.append(token);
      cursor = index + match[0].length;
   }

   fragment.append(document.createTextNode(source.slice(cursor)));
   code.replaceChildren(fragment);
}

function createClipboardIcon(): SVGSVGElement {
   const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

   icon.setAttribute('viewBox', '0 0 24 24');
   icon.setAttribute('aria-hidden', 'true');
   for (const shape of CLIPBOARD_PATHS) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      path.setAttribute('d', shape);
      icon.append(path);
   }
   return icon;
}

function setButtonState(button: HTMLButtonElement, text: string, label: string): void {
   const [, caption] = button.childNodes;

   if (caption) {
      caption.textContent = text;
   }
   button.setAttribute('aria-label', label);
}

/**
 * Names the button after what it copies. A page has many of these, and "Copy command" on
 * every one tells a screen reader user nothing about which is which.
 */
function describeCopy(source: string, kind: string): string {
   const [firstLine = ''] = source.trim().split('\n'),
      preview =
         firstLine.length > COPY_PREVIEW_LENGTH
            ? `${firstLine.slice(0, COPY_PREVIEW_LENGTH)}...`
            : firstLine;

   return `Copy ${kind}: ${preview}`;
}

function createCopyButton(source: string, kind: string): HTMLButtonElement {
   const button = document.createElement('button'),
      label = describeCopy(source, kind);

   button.type = 'button';
   button.className = 'copy-button';
   button.setAttribute('aria-label', label);
   button.append(createClipboardIcon(), document.createTextNode('COPY'));

   button.addEventListener('click', async () => {
      try {
         await navigator.clipboard.writeText(source);
         setButtonState(button, 'COPIED', `Copied ${kind}`);
         globalThis.setTimeout(() => {
            setButtonState(button, 'COPY', label);
         }, COPY_RESET_MS);
      } catch {
         setButtonState(button, 'RETRY', 'Copy failed. Try again');
      }
   });

   return button;
}

function decorate(pre: HTMLPreElement): void {
   if (pre.classList.contains('astro-code') || Object.hasOwn(pre.dataset, 'noDecorate')) {
      return;
   }

   const code = pre.querySelector(':scope > code');

   if (!code) {
      return;
   }

   const source = code.textContent ?? '';
   const blockLabel = pre.dataset.label ?? 'TERMINAL';

   if (!PLAIN_LABELS.has(blockLabel)) {
      highlight(code, source);
   }

   const tools = document.createElement('div');
   const label = document.createElement('span');

   tools.className = 'code-block-tools';
   label.textContent = blockLabel;
   tools.append(label, createCopyButton(source, COPY_KINDS[blockLabel] ?? 'command'));
   pre.prepend(tools);

   // A block that scrolls sideways has to be reachable by keyboard to be scrolled.
   if (pre.scrollWidth > pre.clientWidth) {
      pre.tabIndex = 0;
      pre.setAttribute('role', 'group');
      pre.setAttribute('aria-label', `${blockLabel.toLowerCase()} block`);
   }
}

for (const pre of document.querySelectorAll('pre')) {
   decorate(pre);
}
