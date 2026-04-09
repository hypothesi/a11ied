@storybook
Feature: Storybook target resolution and reuse
  As a maintainer testing isolated components
  I want Storybook stories to flow through the same runtime as URL targets
  So that local component checks do not require a separate accessibility toolchain

  Background:
    Given a Storybook server is available at "http://127.0.0.1:6006"
    And the shared browser helper can resolve story iframe URLs

  Scenario: Storybook story ids resolve to iframe targets
    When I run `a11ied inspect applicable --storybook-url http://127.0.0.1:6006 --story-id forms-login--default --json`
    Then the command exits with code 0
    And the resolved target identifies the Storybook iframe URL
    And the resolved target retains the original story id

  Scenario: Storybook metadata can influence applicability
    Given story "forms-login--default" includes metadata that hints at an authentication flow
    When I inspect applicability for that story
    Then the result for criterion "3.3.8" is not weaker than it would be without the auth hint

  Scenario: Storybook stories can be driven through the same runtime
    When I run `a11ied drive start --target virtual --storybook-url http://127.0.0.1:6006 --story-id dialogs-confirm-delete--default --json`
    Then the command exits with code 0
    And the session target identifies the Storybook story context

  Scenario: Storybook stories can be verified through the same runtime
    When I run `a11ied verify criterion 4.1.3 --storybook-url http://127.0.0.1:6006 --story-id status-updates--default --target virtual --json`
    Then the command exits with code 0
    And the report target identifies the Storybook story id
    And the report structure matches the URL-based verification report shape

  Scenario: Missing stories fail deterministically
    When I run `a11ied inspect applicable --storybook-url http://127.0.0.1:6006 --story-id missing-story --json`
    Then the command exits with code 3
    And the first error explains that the story could not be resolved
