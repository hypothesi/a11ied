# Impeccable skills analysis for the a11ied docs site

I pulled the Impeccable repo locally and read the skill docs instead of treating the landing page like magic.
That helped. The site looks polished, but the useful part is the opinion underneath it.

## What I actually looked at

- `README.md`
- `HARNESSES.md`
- `skills-lock.json`
- `.codex/skills/impeccable/SKILL.md`
- `.codex/skills/impeccable/reference/typography.md`
- `.codex/skills/impeccable/reference/spatial-design.md`
- `.codex/skills/typeset/SKILL.md`
- `.codex/skills/arrange/SKILL.md`
- `.codex/skills/polish/SKILL.md`
- `.codex/skills/colorize/SKILL.md`
- `.codex/skills/critique/SKILL.md`

## The short version

Impeccable is not really about one look. It is about refusing the usual AI-web defaults.

That sounds obvious, but it is the part most generated sites get wrong. They are technically tidy and
emotionally dead. Same fonts. Same pill nav. Same blur-card soup. Same vague copy.

The strongest ideas in the Impeccable material were:

- pick an actual point of view
- make hierarchy obvious
- stop decorating every surface the same way
- stop hiding weak writing behind glossy styling
- be willing to say "this part should be quieter" or "this part should be bolder"

## Skills and what they are really pushing

### `impeccable`

This is the umbrella skill. It is less a component recipe and more a taste enforcer. The useful part for
`a11ied` was the insistence that the site should look like a real editorial decision was made.

Applied to our docs:

- moved away from the soft generic "starter docs" shell
- made the docs rail feel structural instead of decorative
- tightened the copy so it reads like a tool manual, not a launch page

### `typeset`

This is the typography conscience. It pushes hierarchy, rhythm, and restraint.

Applied to our docs:

- switched the headings to a more opinionated serif so the site has a voice
- kept body copy in a utilitarian sans because this is still documentation
- made the page title, section titles, nav labels, and code blocks feel like different jobs

### `arrange`

This one is about layout and rhythm. Less "put things in a grid" and more "do the sections breathe the
same way they think?"

Applied to our docs:

- replaced the all-purpose pill nav with grouped sections in a proper rail
- gave the page a left-rail / main-column structure that reads like documentation instead of marketing
- used route rows and mini-grids where they made scanning easier

### `polish`

This is the anti-sloppiness pass. It is good at spotting when a page is technically okay but still feels
unfinished.

Applied to our docs:

- removed the old left-stripe callout pattern
- reduced the "same rounded card everywhere" feeling
- added a more deliberate visual system for callouts, tags, nav states, and code blocks

### `colorize`

This one is not just "pick nicer colors." It pushes you to pick a palette that means something and stop
being timid.

Applied to our docs:

- moved from a soft beige-and-teal starter palette to a darker rail with a warmer paper field
- kept the accent color warm and a little sharp so the site does not dissolve into generic SaaS calmness

### `critique`

Honestly, this may be the most useful one. It is the skill that says the quiet part out loud: the page
works, but it still looks like AI scaffolding.

Applied to our docs:

- cut vague or stale copy
- fixed docs that described commands the CLI does not actually ship
- rewrote the pages around the real command tree and MCP registrations

## The anti-patterns I wanted to avoid

The Impeccable material keeps circling a few bad habits, and I think it is right to.

- pill nav everywhere
- blur-card stacks with no hierarchy
- gradient text for no reason
- decorative borders pretending to be structure
- generic "platform" tone in the writing
- layouts that look like they came from the same prompt pack

The original `a11ied` docs were not a disaster. They were just too polite. Too soft. Too interchangeable.

## What I changed in response

- grouped the nav into sections so the site has a map instead of a pile of links
- gave the shell a stronger left rail and a more editorial title treatment
- rewrote the docs pages around the actual shipped CLI and MCP surfaces
- made the content more procedural and less hand-wavey
- kept the code examples plain and runnable

## What I did not copy

I did not try to make the `a11ied` docs look like the Impeccable site.

That would have missed the point. The useful lesson is not the exact color or exact typography. It is the
stance: make a design choice, keep it coherent, and stop accepting the default shape just because it is
safe.
