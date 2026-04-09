@cli @axe
Feature: CLI axe execution commands
  As a human or agent using the CLI
  I want rule execution targeted by WCAG level, criterion, or rule id
  So that I can gather automated evidence without hand-picking raw axe calls

  Background:
    Given the CLI command family "a11ied run axe" is installed
    And the internal browser helper can load URL fixtures and inject axe-core

  Scenario: Run axe by criterion on a failing fixture
    When I run `a11ied run axe --url http://127.0.0.1:4173/button-name-failure.html --criterion 4.1.2 --json`
    Then the command exits with code 0
    And the result includes one or more violation rows
    And every reported rule id appears in the coverage mapping for criterion "4.1.2"
    And the result preserves raw rule ids, target nodes, and help URLs

  Scenario: Run axe by level on a contrast failure page
    When I run `a11ied run axe --url http://127.0.0.1:4173/contrast-failure.html --level AA --json`
    Then the command exits with code 0
    And the result includes violations relevant to AA coverage
    And the result includes passes, violations, and incomplete collections when available

  Scenario: Run axe by explicit rule ids limits execution to those rules
    When I run `a11ied run axe --url http://127.0.0.1:4173/basic-page.html --rule color-contrast --json`
    Then the command exits with code 0
    And the result includes only the requested rule ids

  Scenario: Run axe rejects unsupported target input forms in sub-plan 2
    When I run `a11ied run axe --story-id forms-login--default --criterion 4.1.2 --json`
    Then the command exits with code 2
    And the first error explains that Storybook targets are not available in this slice

  Scenario: Run axe preserves incomplete findings
    Given the page under test produces one or more axe incomplete results
    When I run `a11ied run axe --url http://127.0.0.1:4173/basic-page.html --rule frame-tested --json`
    Then the result includes an "incomplete" collection
    And incomplete rows are not dropped from the normalized output
