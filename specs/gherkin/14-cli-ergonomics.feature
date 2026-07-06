Feature: CLI ergonomics for help-heavy agent workflows
  As an agent using the CLI as a machine interface
  I want lightweight help paths and one aggregate help command
  So I can inspect the full grammar without paying runtime costs I do not need

  Background:
    Given the built a11ied CLI is available

  Scenario: Help-like invocations skip startup maintenance
    When I evaluate the startup preflight for "--help"
    Then the CLI skips stale-session cleanup
    And the normal runtime path is still used for real commands

  Scenario: Aggregate help prints the full shipped command tree
    When I run "a11ied help-all"
    Then the output includes the top-level help block
    And the output includes the "wcag" command family
    And the output includes the "inspect applicable" command
    And the output includes the "sr start" command
    And the output includes the "axe" command
    And the output includes representative nested flags
