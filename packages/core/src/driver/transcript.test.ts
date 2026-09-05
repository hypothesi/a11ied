import { describe, expect, it } from 'vitest';

import type { DriverStateSnapshot } from '@a11ied/contracts';

import {
   buildDriverTranscript,
   formatTranscriptMarkdown,
   TranscriptRecorder,
} from './transcript.js';

function stateWith(
   phrases: string[],
   lastSpokenPhrase = phrases.at(-1),
): DriverStateSnapshot {
   return {
      lastSpokenPhrase,
      currentItemText: '',
      spokenPhraseLog: phrases,
      itemTextLog: [],
      logCursor: phrases.length,
      checkpoints: [],
      transcript: [],
   };
}

const session = {
   target: 'virtual' as const,
   url: 'https://example.test/',
   startedAt: '2026-09-04T00:00:00.000Z',
};

describe('formatTranscriptMarkdown', () => {
   it('numbers only the phrases, so a checkpoint does not skip a number', () => {
      const recorder = new TranscriptRecorder();
      recorder.capture(stateWith(['document', 'link, About us']));
      recorder.addCheckpoint('opened', '2026-09-04T00:00:01.000Z');
      recorder.capture(stateWith(['document', 'link, About us', 'button, Save']));
      const markdown = formatTranscriptMarkdown(
         buildDriverTranscript(session, recorder.entries),
      );

      expect(markdown).toContain('3 phrases.');
      expect(markdown).toMatch(/\n1\. \[.*\] document\n2\. \[.*\] link, About us\n/u);
      expect(markdown).toContain('## opened (00:00:01.000)');
      expect(markdown).toMatch(/\n3\. \[.*\] button, Save\n/u);
      expect(markdown).not.toContain('\n4.');
   });

   it('writes the singular for one phrase', () => {
      const recorder = new TranscriptRecorder();
      recorder.capture(stateWith(['document']));

      expect(
         formatTranscriptMarkdown(buildDriverTranscript(session, recorder.entries)),
      ).toContain('1 phrase.');
   });
});

describe('TranscriptRecorder', () => {
   it('keeps a last phrase that the log did not record, once', () => {
      const recorder = new TranscriptRecorder();
      recorder.capture(stateWith(['button, Save']));
      recorder.capture(stateWith(['button, Save'], 'Profile saved successfully.'));
      recorder.capture(stateWith(['button, Save'], 'Profile saved successfully.'));

      expect(recorder.entries.map((entry) => entry.phrase)).toEqual([
         'button, Save',
         'Profile saved successfully.',
      ]);
   });
});
