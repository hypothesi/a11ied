@foundation @engine
Feature: Applicability heuristics for criteria
  As the standards planner
  I want applicability to be derived from explicit signals
  So that the tool does not dump the full standard on every target

  Background:
    Given the engine supports applicability states:
      | applicable |
      | likely-applicable |
      | not-detected |
      | out-of-scope |
      | unknown |

  Scenario: A plain content page keeps auth-only criteria out of scope
    Given the structural signals from "basic-page.html"
    When I ask for applicability for criterion "3.3.8"
    Then the result state is "not-detected"
    And the result reason mentions the absence of authentication-flow signals

  Scenario: A status-message page marks 4.1.3 as applicable
    Given the structural signals from "status-message.html"
    When I ask for applicability for criterion "4.1.3"
    Then the result state is "applicable"
    And the result reasons mention a live region, status role, alert role, or equivalent status signal

  Scenario: An auth flow marks accessible authentication as relevant
    Given the structural signals from "auth-login.html"
    When I ask for applicability for criterion "3.3.8"
    Then the result state is "applicable"
    And the result reasons mention authentication signals

  Scenario: A dialog page marks dialog-related interaction criteria as relevant
    Given the structural signals from "dialog.html"
    When I ask for applicability for the set of relevant criteria
    Then the result matrix includes dialog-related rows marked "applicable"
    And the result matrix includes reasons tied to the detected dialog structure

  Scenario: Quickref tags influence first-pass applicability hints
    Given criterion "4.1.3" carries tags related to forms or status updates
    And the target includes matching signals
    When I ask for applicability for criterion "4.1.3"
    Then the result reasons reference both target signals and criterion tags

  Scenario: Unknown custom widgets stay unknown instead of overclaimed
    Given a target exposes a focusable custom widget with no recognized landmark, form, media, dialog, or auth signals
    When I ask for applicability for criteria related to that widget
    Then at least one unresolved row may return "unknown"
    And the engine does not silently convert that uncertainty into "not applicable"
