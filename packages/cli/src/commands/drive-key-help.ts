const COMMON_KEY_HELP_LINES = [
   'Supported key tokens:',
   '  Chord syntax: join tokens with "+", for example Tab, Shift+Tab, Control+F,',
   '  VO+ArrowRight, or NVDA+N.',
   '',
   '  Common:',
   '    Modifiers: Shift, Control, Alt',
   '    Letters: a-z, A-Z, KeyA-KeyZ',
   '    Digits: 0-9, Digit0-Digit9',
   '    Arrows: ArrowUp, ArrowDown, ArrowLeft, ArrowRight',
   '    Arrow aliases: Up, Down, Left, Right, UpArrow, DownArrow, LeftArrow, RightArrow',
   '    Navigation/editing: Backspace, Tab, Enter, Escape, Space, Spacebar, Delete,',
   '      ForwardDelete, Home, End, PageUp, PageDown, Insert, Help, Clear, CapsLock',
   '    Functions: F1-F20',
   '    Punctuation: Backquote, Backtick, Minus, Dash, Equal, Equals, Backslash,',
   '      LeftSquareBracket, RightSquareBracket, SingleQuote, Comma, Period, FullStop,',
   '      Tilde, Plus',
];
const VOICEOVER_KEY_HELP_LINES = [
   '',
   '  VoiceOver (macOS):',
   '    Modifier aliases: VO (Control+Option), Command, CommandLeft, CommandRight,',
   '      Meta, Option, OptionLeft, OptionRight',
   '    macOS-only keys: Fn, SectionSign, LineFeed, Return, VolumeUp, VolumeDown,',
   '      Mute, Add, Subtract, Multiply, Divide, Decimal',
   '    Examples: VO+ArrowRight, VO+ArrowLeft, VO+Shift+ArrowDown, VO+Space,',
   '      Command+F5',
];
const NVDA_KEY_HELP_LINES = [
   '',
   '  NVDA (Windows):',
   '    Modifier aliases: NVDA or Nvda (Insert), Windows',
   '    Windows-only keys: Application, Pause, Break, PrintScreen, ScrollLock,',
   '      Numlock, NumPad0, NumPad1, NumPad2, NumPad3, NumPad4, NumPad5, NumPad6,',
   '      NumPad7, NumPad8, NumPad9, NumPadEnter, NumPadDelete, NumPadDivide,',
   '      NumPadMinus, NumPadMultiply, NumPadPlus',
   '    Examples: NVDA+N, NVDA+ArrowDown, NVDA+NumPad5, Control+Alt+N',
];

export function getDriveKeyHelp(): string {
   const lines = [...COMMON_KEY_HELP_LINES];

   if (process.platform === 'darwin') {
      lines.push(...VOICEOVER_KEY_HELP_LINES);
   } else if (process.platform === 'win32') {
      lines.push(...NVDA_KEY_HELP_LINES);
   } else {
      lines.push(...VOICEOVER_KEY_HELP_LINES, ...NVDA_KEY_HELP_LINES);
   }

   return `\n${lines.join('\n')}`;
}
