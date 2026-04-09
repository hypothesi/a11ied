Feature: Post-v0.3 docs, API docs, and recording support
  The follow-up slice should finish the product surfaces people actually touch after the first milestone.

  Scenario: Docs site covers every shipped public surface
    Given the docs app is present in the workspace
    When I inspect the docs routes and home navigation
    Then the docs site should cover CLI usage
    And the docs site should cover MCP usage
    And the docs site should cover Storybook usage
    And the docs site should cover public API usage
    And the docs site should cover recording sessions

  Scenario: Public exported functions and classes are documented with JSDoc
    Given the workspace packages expose public entrypoints
    When I inspect the implementation declarations for public exported functions and classes
    Then each covered public export should have a JSDoc block
    And the repo should include an automated regression test for that rule

  Scenario: Drive start can enable recording for a real target
    Given the host supports VoiceOver automation
    When I start a driver session with a recording output path
    Then the command should report active recording metadata
    And stopping the session should finish the recording cleanly

  Scenario: Managed runs can request recording
    Given a command creates and manages its own real target driver session
    When I run a pattern or verification command with a recording output path
    Then the command should pass recording configuration through to the managed session
    And the structured result should include the recording artifact path

  Scenario: Unsupported recording requests fail explicitly
    Given recording support is limited to real targets on supported host operating systems
    When I request recording for a virtual target
    Then the CLI should fail with a validation or environment error
    And the error should explain why the request is unsupported
