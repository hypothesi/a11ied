/**
 * Adds a label bar, syntax highlighting, and a copy button to every `pre > code` block
 * rendered by the docs shell.
 */

const TOKEN_PATTERN =
   /(https?:\/\/[^\s]+|--?[a-z][\w-]*|<[^>\n]+>|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:a1|a11ied|npm|npx|import|from|const|await)\b)/g;

const KEYWORD_PATTERN = /^(import|from|const|await)$/;

const COPY_RESET_MS = 1600;

const COPY_KINDS: Record<string, string> = {
   'AI AGENT PROMPT': 'prompt',
   CONFIG: 'config',
   OUTPUT: 'output',
};

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

function createCopyButton(source: string, kind: string): HTMLButtonElement {
   const button = document.createElement('button');

   button.type = 'button';
   button.className = 'copy-button';
   button.setAttribute('aria-label', `Copy ${kind}`);
   button.append(createClipboardIcon(), document.createTextNode('COPY'));

   button.addEventListener('click', async () => {
      try {
         await navigator.clipboard.writeText(source);
         setButtonState(button, 'COPIED', `Copied ${kind}`);
         globalThis.setTimeout(() => {
            setButtonState(button, 'COPY', `Copy ${kind}`);
         }, COPY_RESET_MS);
      } catch {
         setButtonState(button, 'RETRY', 'Copy failed. Try again');
      }
   });

   return button;
}

function decorate(pre: HTMLPreElement): void {
   const code = pre.querySelector(':scope > code');

   if (!code) {
      return;
   }

   const source = code.textContent ?? '';
   const blockLabel = pre.dataset.label ?? 'TERMINAL';

   highlight(code, source);

   const tools = document.createElement('div');
   const label = document.createElement('span');

   tools.className = 'code-block-tools';
   label.textContent = blockLabel;
   tools.append(label, createCopyButton(source, COPY_KINDS[blockLabel] ?? 'command'));
   pre.prepend(tools);
}

for (const pre of document.querySelectorAll('pre')) {
   decorate(pre);
}
