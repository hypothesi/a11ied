@mcp
Feature: MCP tools and resources
  As an editor or agent integrating with a11ied through MCP
  I want the same runtime semantics exposed through tools and resources
  So that MCP does not become a second product with different behavior

  Background:
    Given the MCP server is running from "packages/mcp-server"

  Scenario: Criterion lookup tool matches CLI lookup semantics
    When I call the MCP tool "criterion lookup" for criterion "4.1.3"
    Then the tool succeeds
    And the returned criterion id is "4.1.3"
    And the payload shape matches the shared contracts used by CLI JSON output

  Scenario: Search tool returns ranked criteria
    When I call the MCP search tool with query "status message"
    Then the tool succeeds
    And the results include criterion "4.1.3"
    And the response includes match metadata

  Scenario: Driver sessions require a session id after session start
    When I call the MCP tool "driver_start_session" with target "virtual"
    Then the tool succeeds
    And the result includes a "sessionId"
    When I call the MCP tool "driver_next_item" without a session id
    Then the tool fails with a validation error

  Scenario: Verification tool returns the same top-level report fields as the CLI
    When I call the MCP verification tool for criterion "4.1.2" on the button-name fixture
    Then the tool call succeeds at the transport level
    And the top-level payload includes "target"
    And the top-level payload includes "wcagVersion"
    And the top-level payload includes "requestedScope"
    And the top-level payload includes "summary"
    And the top-level payload includes "criteria"
    And the criterion row for "4.1.2" has verdict "fail"

  Scenario: Read-only resources are exposed for standards material
    When I list MCP resources
    Then the resource set includes criteria resources
    And the resource set includes level-list resources
    And the resource set includes coverage resources
    And the resource set includes verification-strategy resources

  Scenario: Tool side effects are documented for active tools
    When I inspect the MCP tool metadata for a driver or verification tool
    Then the metadata explains that the tool may launch or drive assistive technology
