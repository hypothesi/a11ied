import { describe, expect, it } from 'vitest';

import { normalizeRule, type RawAxeRule } from './scan.js';

const RULE: Omit<RawAxeRule, 'nodes'> = {
   id: 'button-name',
   impact: 'critical',
   description: 'Buttons must have discernible text',
   help: 'Buttons must have discernible text',
   helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/button-name',
   tags: ['wcag412'],
};

describe('normalizeRule', () => {
   it('keeps a plain selector as it arrived', () => {
      const rule = normalizeRule({ ...RULE, nodes: [{ target: ['button'] }] });

      expect(rule.nodes[0]?.target).toEqual(['button']);
   });

   it('flattens the nested selector axe returns for a shadow root', () => {
      const rule = normalizeRule({
         ...RULE,
         nodes: [{ target: [['my-widget', 'button']] }],
      });

      expect(rule.nodes[0]?.target).toEqual(['my-widget', 'button']);
   });
});
