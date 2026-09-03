@foundation
Feature: WCAG data sync and normalization
  As the maintainer of the standards layer
  I want upstream WCAG and coverage data normalized into pinned local artifacts
  So that the runtime never depends on live network fetches during normal use

  Background:
    Given the workspace contains the "packages/wcag-data" package
    And the sync script fetches only the approved upstream WCAG, ACT, and Quickref sources

  Rule: Raw sources and generated artifacts have different ownership rules

    Scenario: Sync writes raw source files and commits normalized outputs
      When I run the wcag-data sync command
      Then raw source files are written under "packages/wcag-data/data/raw/"
      And normalized artifacts are written under "packages/wcag-data/data/generated/"
      And raw source files are ignored by git
      And normalized artifacts are not ignored by git
      And a provenance manifest is generated and committed with the normalized artifacts

    Scenario: Sync is deterministic
      Given the upstream source content has not changed
      When I run the wcag-data sync command twice
      Then the normalized artifact contents are byte-for-byte identical
      And the generated files keep deterministic ordering for objects and arrays

  Rule: Approved sources are fetched and validated before use

    Scenario: Sync fetches all required upstream sources
      When I run the wcag-data sync command
      Then the fetch list includes "https://www.w3.org/WAI/WCAG22/wcag.json"
      And the fetch list includes "https://www.w3.org/WAI/WCAG21/wcag.json"
      And the fetch list includes "https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json"
      And the fetch list includes "https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml"

    Scenario: Sync fails fast on malformed upstream data
      Given one upstream source returns a payload with the wrong top-level shape
      When I run the wcag-data sync command
      Then the command exits with code 3
      And no normalized artifact is updated from that malformed source
      And the error output identifies the rejected source URL

    Scenario: Sync derives axe metadata locally
      When I run the wcag-data sync command
      Then axe rule metadata is derived from the installed "axe-core" package
      And the sync step does not fetch axe rule descriptions from the network

  Rule: Canonical WCAG artifacts are complete enough for later runtime layers

    Scenario: Canonical generated outputs exist for each WCAG version
      When I run the wcag-data sync command
      Then "criteria.2.2.json" exists in the generated output directory
      And "coverage.2.2.json" exists in the generated output directory
      And "strategy.2.2.json" exists in the generated output directory
      And "slug-index.2.2.json" exists in the generated output directory
      And "tag-index.2.2.json" exists in the generated output directory
      And the same artifact set exists for WCAG version "2.1"

    Scenario: Criterion normalization preserves the required fields
      Given the generated criteria artifact for WCAG "2.2"
      When I resolve criterion "4.1.3"
      Then the criterion object includes "id"
      And the criterion object includes "slug"
      And the criterion object includes "title"
      And the criterion object includes "level"
      And the criterion object includes "normativeText"
      And the criterion object includes "understandingUrl"
      And the criterion object includes "techniques"
      And the criterion object includes "failures"
      And the criterion object includes "tags"

    Scenario: Coverage normalization preserves explicit coverage state
      Given the generated coverage artifact for WCAG "2.2"
      When I resolve coverage for criterion "4.1.3"
      Then the coverage object includes "criterionId"
      And the coverage object includes "coverageState"
      And the coverage object includes "axeRuleIds"
      And the coverage object includes "actRuleIds"
      And the coverage object includes "notes"
      And the coverage object includes "updatedAt"

    Scenario: Verification strategy is generated per criterion
      Given the generated strategy artifact for WCAG "2.2"
      When I resolve strategy for criterion "4.1.3"
      Then the strategy object includes "criterionId"
      And the strategy object includes "preferredEvidenceMode"
      And the strategy object includes "procedureIds"
      And the strategy object includes "requiresRealTarget"
      And the strategy object includes "notes"
