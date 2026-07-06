@foundation @engine
Feature: WCAG engine lookup, search, and coverage queries
  As a consumer of the normalized standards layer
  I want stable engine APIs for lookup, listing, search, and coverage
  So that CLI and MCP can share one source of truth

  Background:
    Given generated WCAG artifacts exist for versions "2.2" and "2.1"
    And the "packages/wcag-engine" package is wired to those artifacts

  Scenario: Criterion lookup resolves the same criterion by id and slug
    When I call getCriterion with "4.1.3"
    And I call getCriterion with "status-messages"
    Then both calls resolve successfully
    And both calls return the same canonical criterion id
    And both calls return the same title and level

  Scenario Outline: Level listing returns criteria for the requested WCAG version
    When I call listCriteriaByLevel with level "<level>" and version "<version>"
    Then every returned criterion has level "<level>"
    And every returned criterion belongs to WCAG version "<version>"

    Examples:
      | level | version |
      | A     | 2.2     |
      | AA    | 2.2     |
      | AAA   | 2.2     |
      | A     | 2.1     |

  Scenario: Search finds the status messages criterion by plain-language query
    When I call searchCriteria with query "status message"
    Then the first page of results includes criterion "4.1.3"
    And the result for "4.1.3" includes enough match metadata to explain why it matched

  Scenario: Search considers techniques and failures as well as titles
    When I call searchCriteria with a phrase that appears only in a known failure or technique for "1.3.1"
    Then the results include criterion "1.3.1"

  Scenario: Coverage lookup joins coverage data to the criterion model
    When I call getCoverage with "4.1.2"
    Then the result includes the canonical criterion id
    And the result includes an explicit coverage state
    And the result includes the mapped axe rule ids
    And the result includes the mapped ACT rule ids

  Scenario: Unsupported criterion ids are rejected deterministically
    When I call getCriterion with "9.9.9"
    Then the call fails with a typed not-found error
    And the error payload identifies the unresolved lookup key

  Scenario: Unsupported WCAG versions are rejected deterministically
    When I call listCriteriaByLevel with level "AA" and version "2.0"
    Then the call fails with a typed validation error
    And the error payload lists the supported versions
