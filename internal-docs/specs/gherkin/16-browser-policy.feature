Feature: System-browser-first Playwright policy
  The browser-backed runtime should use an existing local Chromium-family browser when possible
  and only ask the user to install Playwright Chromium when no usable browser is present.

  Scenario: Doctor reports the browser automation policy
    Given the machine has at least one usable Chromium-family browser
    When I run the doctor command
    Then the report includes the browser automation policy name
    And the report lists the detected browser candidates
    And the report names the preferred launch target
    And the report shows the fallback install command "npx playwright install chromium"

  Scenario: Browser-backed commands prefer an installed system browser
    Given the machine has an installed Chrome browser
    And no explicit browser override is active
    When I run a browser-backed command
    Then a11ied launches the installed system browser before trying bundled Chromium

  Scenario: Playwright managed Chromium is used when no system browser is available
    Given the machine has no installed Chrome, Edge, Brave, or Chromium browser
    And Playwright managed Chromium is installed
    When I run a browser-backed command
    Then a11ied launches Playwright managed Chromium

  Scenario: Missing browser support fails with an actionable install command
    Given the machine has no usable system browser
    And Playwright managed Chromium is not installed
    When I run a browser-backed command
    Then the command fails with an environment error
    And the error tells me to run "npx playwright install chromium"

  Scenario: Docs explain the current browser policy
    Given the docs site is built from the current repo state
    When I review the browser-backed command documentation
    Then it says that a11ied prefers existing local Chromium-family browsers
    And it shows the fallback install command "npx playwright install chromium"
