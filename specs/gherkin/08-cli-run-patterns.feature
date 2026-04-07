@cli @pattern @virtual
Feature: CLI reusable interaction patterns
  As a human or agent using the CLI
  I want named interaction patterns with stable evidence output
  So that repeated accessibility checks do not turn into ad hoc keyboard macros

  Background:
    Given the CLI command family "a11lied run pattern" is installed
    And pattern commands manage driver sessions internally by default

  Scenario: Landmark sequence returns ordered spoken and item logs
    When I run `a11lied run pattern landmark_sequence --url http://127.0.0.1:4173/basic-page.html --target virtual --json`
    Then the command exits with code 0
    And the result includes a step log
    And the result includes a spoken phrase log
    And the result includes an item text log

  Scenario: Heading sequence visits headings in document order
    When I run `a11lied run pattern heading_sequence --url http://127.0.0.1:4173/basic-page.html --target virtual --json`
    Then the command exits with code 0
    And the result preserves the discovered heading order
    And the result includes assertion results for the pattern

  Scenario: Status message probe captures announcement evidence
    When I run `a11lied run pattern status_message_probe --url http://127.0.0.1:4173/status-message.html --target virtual --json`
    Then the command exits with code 0
    And the result includes the trigger step
    And the result includes the exact spoken phrase log captured after the trigger
    And the result records whether focus changed unexpectedly

  Scenario: Dialog probe captures dialog focus behavior
    When I run `a11lied run pattern dialog_probe --url http://127.0.0.1:4173/dialog.html --target virtual --json`
    Then the command exits with code 0
    And the result includes assertions for focus entry, focus containment, and close behavior

  Scenario: Focus visibility probe may attach browser evidence
    When I run `a11lied run pattern focus_visibility_probe --url http://127.0.0.1:4173/focus-obscured.html --target virtual --json`
    Then the command exits with code 0
    And the result includes assertion rows
    And the result may include browser evidence artifacts when visual confirmation is required

  Scenario: Advanced debugging can reuse an existing session
    Given I started a virtual driver session and saved its session id as the active session id
    When I run `a11lied run pattern landmark_sequence --url http://127.0.0.1:4173/basic-page.html --target virtual --session $ACTIVE_SESSION_ID --json`
    Then the command exits with code 0
    And the pattern run uses the provided session instead of starting a second one
