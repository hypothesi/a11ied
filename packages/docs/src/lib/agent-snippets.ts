import { REPOSITORY_URL } from './nav';

export const SKILLS_INSTALL_COMMAND = `npx -y @a1st/aix install ${REPOSITORY_URL}/blob/master/packages/skills/ai.json --only skills --user`;

export const AUDIT_PROMPT =
   'Audit https://example.com against WCAG 2.2 AA with a11ied. Do not submit the contact form. Use four workers.';
