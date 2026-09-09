import { describe } from 'vitest';
import { test, type QueuedChain, type QueuedCommands } from 'a11ied/vitest';

/*
 * The dropdown menu demo on the Reka UI docs, read with the virtual screen reader. Each
 * test names the row of the ARIA Authoring Practices Guide (APG) actions menu button
 * example it covers (`a1 pattern menu-button-actions`) and the WCAG criterion behind it.
 */
const MENU_URL = 'https://reka-ui.com/docs/components/dropdown-menu';
const TRIGGER = 'Customise options';
const TRIGGER_PHRASE = `button, ${TRIGGER}, not expanded, has popup menu`;
const FIRST_ITEM = /^menuitem, New Tab .*, position 1, set size 5$/u;
/**
 * How long the open menu gets before the next key. The menu attaches its Escape handler a
 * moment after it opens, and a key pressed before that is dropped.
 */
const SETTLE_MS = 300;

const menu = test.extend({ srOptions: { url: MENU_URL } });

/** Moves to the button and opens the menu with Enter, leaving a checkpoint at the press. */
function openMenu(sr: QueuedCommands): QueuedChain<string> {
   return sr
      .goTo({ role: 'button', name: TRIGGER })
      .checkpoint('open')
      .press('Enter')
      .wait({ ms: SETTLE_MS });
}

describe('the menu button', () => {
   // APG menu-button-aria-haspopup, aria-expanded. WCAG 4.1.2 Name, Role, Value.
   menu('says it has a popup menu and is not expanded', ({ sr }) => {
      sr.goTo({ role: 'button', name: TRIGGER }).expect.spoken(TRIGGER_PHRASE);
   });

   // APG menu-button-key-open. WCAG 2.1.1 Keyboard, 2.4.3 Focus Order.
   menu('Enter opens the menu and moves focus to the first item', ({ sr }) => {
      openMenu(sr).expect.spoken(FIRST_ITEM, { since: 'open' });
   });

   menu('Space opens the menu and moves focus to the first item', ({ sr }) => {
      sr.goTo({ role: 'button', name: TRIGGER })
         .checkpoint('open')
         .press('Space')
         .expect.spoken(FIRST_ITEM, { since: 'open' });
   });

   menu('Down Arrow opens the menu and moves focus to the first item', ({ sr }) => {
      sr.goTo({ role: 'button', name: TRIGGER })
         .checkpoint('open')
         .press('ArrowDown')
         .expect.spoken(FIRST_ITEM, { since: 'open' });
   });
});

describe('the menu', () => {
   // APG menu role, aria-labelledby. WCAG 4.1.2 Name, Role, Value.
   menu('the items are inside a menu named by the button', ({ sr }) => {
      openMenu(sr)
         .previous()
         .expect.spoken(/^menu, Customise options/u, { since: 'open' });
   });

   // Menu and Menubar pattern: focus stays in the menu until a key moves it out.
   menu('the rest of the page is hidden while the menu is open', ({ sr }) => {
      openMenu(sr)
         .top()
         .next()
         .expect.spoken(/^menu, Customise options/u, { since: 'open' });
   });
});

describe('moving through the menu', () => {
   // APG menu-key-down-arrow, menu-key-up-arrow. WCAG 2.1.1 Keyboard.
   menu('Down Arrow and Up Arrow move between items', ({ sr }) => {
      openMenu(sr)
         .press('ArrowDown')
         .expect.cursorOn({ role: 'menuitem', name: 'More Tools' })
         .press('ArrowUp')
         .expect.cursorOn({ role: 'menuitem', name: 'New Tab' });
   });

   // APG menu-key-end, menu-key-home. WCAG 2.1.1 Keyboard.
   menu('End and Home move to the last and first items', ({ sr }) => {
      openMenu(sr)
         .press('End')
         .expect.cursorOn({ role: 'menuitemradio', name: 'Colm Tuite' })
         .press('Home')
         .expect.cursorOn({ role: 'menuitem', name: 'New Tab' });
   });

   // APG menu-key-character. WCAG 2.1.1 Keyboard.
   menu('a letter moves to the next item that starts with it', ({ sr }) => {
      openMenu(sr).press('n').expect.cursorOn({ role: 'menuitem', name: 'New Window' });
   });
});

describe('submenus', () => {
   // Menu and Menubar pattern, Right Arrow and Left Arrow on a menuitem with a submenu.
   menu('Right Arrow opens a submenu and Left Arrow closes it', ({ sr }) => {
      openMenu(sr)
         .press('ArrowDown', 'ArrowRight')
         .expect.cursorOn({ role: 'menuitem', name: 'Save Page As' })
         .press('ArrowLeft')
         .expect.cursorOn({ role: 'menuitem', name: 'More Tools' });
   });
});

describe('item states', () => {
   // WCAG 4.1.2 Name, Role, Value: checkable items expose their state.
   menu('a checkbox item says whether it is checked', ({ sr }) => {
      openMenu(sr)
         .press('End', 'ArrowUp', 'ArrowUp', 'ArrowUp')
         .expect.spoken(/^menuitemcheckbox, Show Full URLs, not checked/u, {
            since: 'open',
         });
   });

   menu('the selected radio item says it is checked', ({ sr }) => {
      openMenu(sr)
         .press('End', 'ArrowUp')
         .expect.spoken(/^menuitemradio, Pedro Duarte, checked/u, { since: 'open' });
   });
});

describe('leaving the menu', () => {
   // APG menu-key-escape. WCAG 2.1.1 Keyboard, 2.4.3 Focus Order.
   menu('Escape closes the menu and returns focus to the button', ({ sr }) => {
      openMenu(sr)
         .checkpoint('escape')
         .press('Escape')
         .expect.cursorOn({ role: 'button', name: TRIGGER })
         .and.spoken(TRIGGER_PHRASE, { since: 'escape' });
   });

   // Menu and Menubar pattern, Enter: activates the item and closes the menu. WCAG 2.1.1.
   menu('Enter on an item activates it, closes the menu, and returns focus', ({ sr }) => {
      openMenu(sr)
         .checkpoint('activate')
         .press('Enter')
         .expect.cursorOn({ role: 'button', name: TRIGGER })
         .and.spoken(TRIGGER_PHRASE, { since: 'activate' });
   });

   // Menu and Menubar pattern, Tab: moves focus out of the menu and closes it. WCAG 2.1.1.
   menu('Tab moves focus out of the menu and closes it', ({ sr }) => {
      openMenu(sr).press('Tab').expect.cursorOn({ role: 'button' }, { timeoutMs: 0 });
   });

   // APG menu-key-enter. WCAG 2.1.1 Keyboard.
   menu('Enter on an item with a submenu opens the submenu', ({ sr }) => {
      openMenu(sr)
         .press('ArrowDown')
         .checkpoint('submenu')
         .press('Enter')
         .expect.spoken(/^menuitem, Save Page As.*, position 1, set size 4$/u, {
            since: 'submenu',
         });
   });
});
