import { Box, Text, useApp, useInput, useWindowSize, type Key } from 'ink';
import { createElement, useMemo, useState, type ReactElement } from 'react';
import chalk from 'chalk';
import {
   axeCommandFor,
   buildDetailLines,
   listFinderRows,
   type FinderRow,
   type FinderSection,
} from './finder-data.js';

type Pane = 'search' | 'detail';

export interface FinderAppProps {
   version: string;
   copyCommand: (command: string) => Promise<string>;
}

interface FinderState {
   query: string;
   selected: number;
   pane: Pane;
   section: FinderSection;
   scroll: number;
   notice: string;
}

interface FinderStore {
   state: FinderState;
   update: (patch: Partial<FinderState>) => void;
}

const LIST_WIDTH_RATIO = 0.4;
const CHROME_ROWS = 4;
const BORDER_COLUMNS = 2;
const PAGE_STEP = 10;
const HALF = 2;
const PANE_COUNT = 2;
const sectionHotkeys: ReadonlyArray<{ hotkey: string; section: FinderSection }> = [
   { hotkey: 't', section: 'testing' },
   { hotkey: 'f', section: 'fails' },
   { hotkey: 'u', section: 'understanding' },
   { hotkey: 'a', section: 'all' },
];

const HELP_TEXT =
   'up/down move  enter open detail  esc back or quit  t testing  f if it fails  u understanding  a all  y copy axe command  q quit';

function useFinderStore(): FinderStore {
   const [state, setState] = useState<FinderState>({
      query: '',
      selected: 0,
      pane: 'search',
      section: 'all',
      scroll: 0,
      notice: '',
   });
   const update = (patch: Partial<FinderState>): void => {
      setState((previous) => ({ ...previous, ...patch }));
   };
   return { state, update };
}

function clamp(value: number, max: number): number {
   return Math.max(0, Math.min(value, max));
}

function handleListMovement(store: FinderStore, key: Key, rowCount: number): boolean {
   const { selected } = store.state;
   if (key.upArrow) {
      store.update({ selected: clamp(selected - 1, rowCount - 1), scroll: 0 });
      return true;
   }
   if (key.downArrow) {
      store.update({ selected: clamp(selected + 1, rowCount - 1), scroll: 0 });
      return true;
   }
   return false;
}

function handleSearchKey(store: FinderStore, input: string, key: Key): void {
   const { query } = store.state;
   if (key.return) {
      store.update({ pane: 'detail', notice: '' });
      return;
   }
   if (key.backspace || key.delete) {
      store.update({ query: query.slice(0, -1), selected: 0 });
      return;
   }
   if (input && !key.ctrl && !key.meta) {
      store.update({ query: `${query}${input}`, selected: 0 });
   }
}

function handleDetailKey(input: {
   store: FinderStore;
   key: Key;
   input: string;
   lineCount: number;
   copy: () => void;
}): void {
   const { store, key } = input;
   const section = sectionHotkeys.find((entry) => entry.hotkey === input.input)?.section;
   if (key.escape || input.input === 'q') {
      store.update({ pane: 'search' });
      return;
   }
   if (section) {
      store.update({ section, scroll: 0 });
      return;
   }
   if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
      const step = key.pageUp || key.pageDown ? PAGE_STEP : 1;
      const direction = key.upArrow || key.pageUp ? -1 : 1;
      store.update({
         scroll: clamp(store.state.scroll + direction * step, input.lineCount),
      });
      return;
   }
   if (input.input === 'y') {
      input.copy();
   }
}

function useFinderInput(input: {
   store: FinderStore;
   rows: FinderRow[];
   lineCount: number;
   copy: () => void;
}): void {
   const { exit } = useApp();
   const { store } = input;
   useInput((typed, key) => {
      if (store.state.pane === 'search') {
         if (key.escape) {
            exit();
            return;
         }
         if (!handleListMovement(store, key, input.rows.length)) {
            handleSearchKey(store, typed, key);
         }
         return;
      }
      handleDetailKey({
         store,
         key,
         input: typed,
         lineCount: input.lineCount,
         copy: input.copy,
      });
   });
}

function rowLabel(row: FinderRow, isSelected: boolean, width: number): string {
   const hint = row.hint ? chalk.dim(`  ${row.hint}`) : '';
   const text = `${row.id}  ${row.title}  ${chalk.dim(`[${row.level}]`)}${hint}`;
   const clipped = text.length > width ? `${text.slice(0, width - 1)}…` : text;
   return isSelected ? chalk.inverse(clipped) : clipped;
}

function ListPane(props: {
   store: FinderStore;
   rows: FinderRow[];
   width: number;
   height: number;
}): ReactElement {
   const { state } = props.store;
   const visibleRows = Math.max(1, props.height - 1);
   const start = clamp(
      state.selected - Math.floor(visibleRows / HALF),
      Math.max(0, props.rows.length - visibleRows),
   );
   const cursor = state.pane === 'search' ? chalk.inverse(' ') : '';
   const rows = props.rows.slice(start, start + visibleRows);

   return createElement(
      Box,
      {
         flexDirection: 'column',
         width: props.width,
         borderStyle: 'round',
         borderColor: state.pane === 'search' ? 'cyan' : 'gray',
      },
      createElement(
         Text,
         { wrap: 'truncate' },
         `${chalk.cyan('Search:')} ${state.query}${cursor}`,
      ),
      ...rows.map((row, index) =>
         createElement(
            Text,
            { key: row.id, wrap: 'truncate' },
            rowLabel(row, start + index === state.selected, props.width - BORDER_COLUMNS),
         ),
      ),
   );
}

function DetailPane(props: {
   store: FinderStore;
   lines: string[];
   width: number;
   height: number;
}): ReactElement {
   const { state } = props.store;
   const visible = props.lines.slice(state.scroll, state.scroll + props.height);
   return createElement(
      Box,
      {
         flexDirection: 'column',
         width: props.width,
         flexShrink: 0,
         borderStyle: 'round',
         borderColor: state.pane === 'detail' ? 'cyan' : 'gray',
      },
      ...visible.map((line, index) =>
         createElement(
            Text,
            { key: `${state.scroll}-${index}`, wrap: 'truncate' },
            line || ' ',
         ),
      ),
   );
}

/**
 * Two-pane WCAG finder: search and results on the left, the criterion detail on the
 * right.
 */
export function FinderApp(props: FinderAppProps): ReactElement {
   const store = useFinderStore();
   const { columns, rows: terminalRows } = useWindowSize();
   const { state } = store;
   const rows = useMemo(
      () => listFinderRows(state.query, props.version),
      [state.query, props.version],
   );
   const current = rows[clamp(state.selected, rows.length - 1)];
   const listWidth = Math.floor(columns * LIST_WIDTH_RATIO);
   const paneHeight = Math.max(1, terminalRows - CHROME_ROWS);
   const detailWidth = columns - listWidth - BORDER_COLUMNS * PANE_COUNT;
   const lines = useMemo(
      () =>
         current
            ? buildDetailLines({
                 criterionId: current.id,
                 version: props.version,
                 section: state.section,
                 width: detailWidth,
              })
            : [],
      [current, props.version, state.section, detailWidth],
   );
   const copy = (): void => {
      if (current) {
         props.copyCommand(axeCommandFor(current.id)).then(
            (notice) => store.update({ notice }),
            () => store.update({ notice: 'Clipboard unavailable' }),
         );
      }
   };
   useFinderInput({ store, rows, lineCount: lines.length, copy });

   return createElement(
      Box,
      { flexDirection: 'column', height: terminalRows },
      createElement(
         Box,
         { flexDirection: 'row', height: paneHeight + BORDER_COLUMNS },
         createElement(ListPane, { store, rows, width: listWidth, height: paneHeight }),
         createElement(DetailPane, {
            store,
            lines,
            width: detailWidth,
            height: paneHeight,
         }),
      ),
      createElement(
         Box,
         { width: columns, flexShrink: 0 },
         createElement(Text, { wrap: 'truncate' }, chalk.dim(state.notice || HELP_TEXT)),
      ),
   );
}
