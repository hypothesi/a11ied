Feature: Docs UX remediation
  The docs site should help operators and agents get to the right workflow quickly,
  stay readable on real devices, and remain honest about the shipped product surface.

  Background:
    Given the docs site is built from the Astro app in "packages/docs"
    And the docs content describes the shipped CLI, MCP, and package entrypoints

  Rule: Mobile readers must reach content before navigation becomes a chore

    Scenario: Mobile shell exposes content in the first viewport
      Given a reader opens the docs homepage on a phone-sized viewport
      When the page first loads
      Then the page title and first content block are visible without scrolling through the full route list
      And a navigation control is available to reveal the docs route map

  Rule: First-time readers should be able to start from tasks instead of internals

    Scenario: Homepage offers task-first entry points
      Given a reader lands on the docs homepage
      When they scan the first major content blocks
      Then they can choose workflows such as checking one criterion, driving a session, or using the agent surface
      And the workflow entry points link to the relevant reference pages

  Rule: Typography and contrast should support sustained reading

    Scenario: Long-form docs content stays readable
      Given a reader opens a long-form docs page
      When they read the page on desktop or mobile
      Then body copy uses a readable measure
      And secondary text remains legible against its background
      And code examples remain easy to scan

  Rule: Layout should feel deliberate instead of templated

    Scenario: Key pages use more than one section rhythm
      Given a reader opens the homepage, CLI reference, and MCP usage pages
      When they compare the section structure across those pages
      Then the site does not rely on one repeated rounded-panel pattern for every major section
      And each page still preserves clear grouping and reading order

  Rule: Visual polish must not hide unfinished or inaccurate product claims

    Scenario: Public docs surfaces remain honest after the redesign
      Given the docs redesign is complete
      When the homepage, CLI docs, MCP docs, workflow pages, and release checklist are reviewed
      Then they describe only shipped or explicitly blocked product surfaces
      And they do not imply fake completeness through placeholder affordances or stale "planned" language
