import { describe, expect, it } from 'vitest';

import { isTalkBackKey, parseTalkBackSpeech } from './talkback.js';

const LOG = [
   '11-17 10:30:18.900  3353  3353 D talkback: ProcessorEventQueue: Processing event: TYPE_VIEW_CLICKED',
   '11-17 10:30:18.901  3353  3353 D talkback: Pipeline: execute() feedback=Feedback{failovers=[Part= speech= action=SPEAK  text=""  options= earcons=[2131951653]',
   '11-17 10:30:18.984  3353  3353 D talkback: Pipeline: execute() feedback=Feedback{failovers=[Part= speech= action=SPEAK  text="Airplane mode, OFF, Switch"  options= queueMode=QUEUE',
   '11-17 10:30:18.984  3353  3353 D talkback: Actors: act() part=Part= speech= action=SPEAK  text="Airplane mode, OFF, Switch"  options=',
   '11-17 10:30:18.985  3353  3353 V talkback: Pipeline: execute() success=true for part=Part= speech= action=SPEAK  text="Airplane mode, OFF, Switch"',
   '11-17 10:30:20.100  3353  3353 D talkback: Pipeline: execute() feedback=Feedback{failovers=[Part= speech= action=SPEAK  text="Double-tap to activate"  options=',
].join('\n');

describe('TalkBack speech log', () => {
   it('reads each spoken phrase once, in order, skipping silent feedback', () => {
      expect(parseTalkBackSpeech(LOG)).toEqual([
         'Airplane mode, OFF, Switch',
         'Double-tap to activate',
      ]);
   });

   it('finds nothing when TalkBack did not log speech', () => {
      expect(
         parseTalkBackSpeech('11-17 10:31:15.555 489 2262 D WifiNative: Scan result'),
      ).toEqual([]);
   });

   it('accepts only the keys a walk can press', () => {
      expect(isTalkBackKey('next')).toBe(true);
      expect(isTalkBackKey('constructor')).toBe(false);
   });
});
