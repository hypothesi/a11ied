@docs @release
Feature: Docs, skill guidance, CI, and release checks
  As the maintainer shipping the first public milestone
  I want the docs, skill, and release checks to reinforce the same product rules
  So that users and agents do not overclaim what the tool can prove

  Scenario: Docs cover the required runtime topics
    Given the docs site source exists under "apps/docs"
    When I build the docs site
    Then the build succeeds
    And the built docs include pages or routes for:
      | WCAG data sources |
      | criterion lookup |
      | applicability |
      | driver usage |
      | pattern execution |
      | verification semantics |

  Scenario: The a11ied skill includes the required guardrails
    When I read "skills/a11ied/SKILL.md"
    Then it tells the agent to resolve WCAG criteria before testing
    And it distinguishes automated, hybrid, and manual evidence
    And it warns that raw driver transcripts are not the same as compliance verdicts

  Scenario: Pull-request CI includes virtual-target smoke coverage
    When I inspect the CI workflow configuration
    Then the workflow includes data validation
    And the workflow includes contract tests
    And the workflow includes CLI smoke tests
    And the workflow includes virtual-target verification smoke tests
    And the workflow includes a docs build

  @manual-release
  Scenario: Public releases require real-target manual smoke checks
    Given I am preparing a public minor or major release
    When I run the release checklist
    Then the checklist requires a manual macOS VoiceOver smoke run
    And the checklist requires a manual Windows NVDA smoke run
    And the checklist requires all CI checks to have passed first
