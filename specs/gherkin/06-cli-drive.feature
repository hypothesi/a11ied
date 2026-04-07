@cli @drive
Feature: CLI accessibility-driver commands
  As a human or agent using the CLI
  I want low-level screen-reader control with stable sessions
  So that I can manually explore and script interactions the way a user would

  Background:
    Given the CLI command family "a11lied drive" is installed
    And the local broker stores session metadata under ".a11lied/state/sessions/"

  Scenario: Starting a driver session returns a session id and state metadata
    When I run `a11lied drive start --target virtual --json`
    Then the command exits with code 0
    And the result includes a non-empty "sessionId"
    And the result includes the target "virtual"
    And the session metadata file exists for that session id

  Scenario: Driver actions require an explicit session id unless ephemeral mode is used
    When I run `a11lied drive next --target virtual --json`
    Then the command exits with code 2
    And the first error explains that a session id is required

  Scenario: Ephemeral mode performs one action without keeping the session
    When I run `a11lied drive next --target virtual --ephemeral --json`
    Then the command exits with code 0
    And the result includes action output for one navigation step
    And no persistent session metadata remains afterward

  Scenario: Reading driver state returns spoken and item text snapshots
    Given I started a virtual driver session and saved its session id as the active session id
    When I run `a11lied drive read --session $ACTIVE_SESSION_ID --json`
    Then the command exits with code 0
    And the result includes "lastSpokenPhrase" when available
    And the result includes "currentItemText" when available
    And the result includes "logCursor"

  Scenario: Clearing logs resets later log reads
    Given I started a virtual driver session and saved its session id as the active session id
    And I performed one or more actions that produced speech logs
    When I run `a11lied drive clear-logs --session $ACTIVE_SESSION_ID --json`
    And I run `a11lied drive logs --session $ACTIVE_SESSION_ID --json`
    Then the log result is empty

  Scenario: Unknown session ids fail as runtime state errors
    When I run `a11lied drive status --session missing-session --json`
    Then the command exits with code 3
    And the first error explains that the session was not found

  Scenario: Stopping a session removes its persisted state
    Given I started a virtual driver session and saved its session id as the active session id
    When I run `a11lied drive stop --session $ACTIVE_SESSION_ID --json`
    Then the command exits with code 0
    And the session metadata file no longer exists
