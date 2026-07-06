@cli
Feature: CLI WCAG lookup commands
  As a human or agent using the CLI
  I want WCAG lookup commands that are stable in text and JSON form
  So that I can inspect requirements without scraping documentation sites

  Background:
    Given the CLI command family "a11ied wcag" is installed
    And the WCAG engine artifacts are available locally

  Scenario: Levels command defaults to WCAG 2.2
    When I run `a11ied wcag levels --json`
    Then the command exits with code 0
    And the JSON envelope field "ok" is true
    And the command metadata records WCAG version "2.2"
    And the result includes the levels "A", "AA", and "AAA"

  Scenario: Criteria command filters by level and explicit WCAG version
    When I run `a11ied wcag criteria --level AA --version 2.1 --json`
    Then the command exits with code 0
    And every returned row belongs to WCAG version "2.1"
    And every returned row has level "AA"

  Scenario: Show command resolves a criterion by slug
    When I run `a11ied wcag show status-messages --json`
    Then the command exits with code 0
    And the result criterion id is "4.1.3"
    And the result includes normative text and understanding links

  Scenario: Search command returns ranked results
    When I run `a11ied wcag search "status message" --json`
    Then the command exits with code 0
    And the result includes criterion "4.1.3"
    And the result includes ranking or match metadata for each row

  Scenario: Coverage command returns explicit coverage and strategy data
    When I run `a11ied wcag coverage 4.1.3 --json`
    Then the command exits with code 0
    And the result includes "coverageState"
    And the result includes "axeRuleIds"
    And the result includes "actRuleIds"
    And the result includes evidence metadata

  Scenario: Unsupported version returns a validation failure
    When I run `a11ied wcag criteria --level AA --version 2.0 --json`
    Then the command exits with code 2
    And the JSON envelope field "ok" is false
    And the first error explains that WCAG version "2.0" is unsupported
