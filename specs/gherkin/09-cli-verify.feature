@cli @verify
Feature: CLI WCAG verification commands
  As a human or agent using the CLI
  I want criterion-level and level-level verification that stays honest about coverage
  So that the tool never mistakes partial automation for full compliance

  Background:
    Given the CLI command family "a11ied verify" is installed
    And verification consumes coverage and verification-strategy artifacts from the WCAG engine

  Scenario: Verify criterion reports an automated failure clearly
    When I run `a11ied verify criterion 4.1.2 --url http://127.0.0.1:4173/button-name-failure.html --target virtual --json`
    Then the command exits with code 4
    And the top-level report includes requested scope "criterion"
    And the criterion row for "4.1.2" has verdict "fail"
    And the criterion row includes evidence mode "automated"
    And the criterion row includes evidence records and source references

  Scenario: Verify criterion reports a hybrid result for status messages
    When I run `a11ied verify criterion 4.1.3 --url http://127.0.0.1:4173/status-message.html --target virtual --json`
    Then the command exits with code 0
    And the criterion row for "4.1.3" includes evidence mode "hybrid"
    And the criterion row for "4.1.3" has verdict "pass"
    And the criterion row includes the procedure ids chosen from the verification strategy
    And the criterion row includes spoken evidence proving that the status message was announced

  Scenario: Verify criterion keeps manual-only outcomes explicit
    When I run `a11ied verify criterion 3.3.8 --url http://127.0.0.1:4173/auth-login.html --target virtual --json`
    Then the command exits with code 4
    And the criterion row for "3.3.8" does not report a false pass
    And the criterion row verdict is "needs-manual-review"
    And the row explains what evidence was and was not collected

  Scenario: Verify level emits a complete criterion matrix
    When I run `a11ied verify level AA --url http://127.0.0.1:4173/auth-login.html --target virtual --json`
    Then the command exits with code 4
    And the top-level report includes "wcagVersion"
    And the top-level report includes "requestedScope"
    And the top-level report includes "summary"
    And the top-level report includes "criteria"
    And the report does not stop after the first failing criterion
    And the report includes uncovered and manual-only rows when they apply

  Scenario: Verify defaults to WCAG 2.2
    When I run `a11ied verify criterion 4.1.2 --url http://127.0.0.1:4173/button-name-failure.html --target virtual --json`
    Then the command exits with code 4
    And the report WCAG version is "2.2"

  Scenario: Invalid criterion input returns a validation failure
    When I run `a11ied verify criterion 9.9.9 --url http://127.0.0.1:4173/basic-page.html --target virtual --json`
    Then the command exits with code 2
    And the first error identifies the unresolved criterion key
