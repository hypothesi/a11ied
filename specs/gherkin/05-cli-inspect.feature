@cli
Feature: CLI inspect commands
  As a human or agent using the CLI
  I want inspect commands that explain criterion applicability for a target
  So that I can decide what to test before I start driving assistive technology

  Background:
    Given the CLI command family "a11ied inspect" is installed
    And the internal browser helper can open URL targets

  Scenario: Inspect applicable returns a criterion matrix for a URL target
    When I run `a11ied inspect applicable --url http://127.0.0.1:4173/status-message.html --json`
    Then the command exits with code 0
    And the result includes a matrix of criteria with applicability states
    And the row for criterion "4.1.3" is "applicable"
    And the row for each criterion includes reasons or evidence signals

  Scenario: Inspect criterion explains a single criterion for a target
    When I run `a11ied inspect criterion 4.1.3 --url http://127.0.0.1:4173/status-message.html --json`
    Then the command exits with code 0
    And the result identifies criterion "4.1.3"
    And the result includes one explicit applicability state
    And the result includes the signals that produced that state

  Scenario: Inspect does not expose Storybook inputs in sub-plan 2
    When I run `a11ied inspect applicable --story-id forms-login--default --json`
    Then the command exits with code 2
    And the first error explains that Storybook targets are not available in this milestone slice

  Scenario: Inspect rejects invalid criteria deterministically
    When I run `a11ied inspect criterion 9.9.9 --url http://127.0.0.1:4173/basic-page.html --json`
    Then the command exits with code 2
    And the first error identifies the unresolved criterion key
