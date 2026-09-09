Feature: Queued screen reader commands in tests
  A test calls screen reader methods without await. The commands run one at a time in the
  order they were queued, and a failure that nobody awaited fails the test.

  Scenario: Commands run in the order they were queued
    Given a test queues three screen reader commands without awaiting them
    When the queue runs
    Then the commands run one at a time in that order

  Scenario: Awaiting a command runs everything queued before it
    Given a test queues two commands without awaiting them
    And then awaits a third command that returns a value
    When the await settles
    Then the first two commands have run
    And the await gives the third command's value

  Scenario: An awaited failure goes to that await and the queue continues
    Given a test awaits a command that fails
    When the test catches the rejection and queues another command
    Then the rejection is the failure
    And the other command runs

  Scenario: An unawaited failure stops the queue
    Given a test queues a failing command without awaiting it
    And then queues another command
    When the queue reaches the failure
    Then the other command never runs
    And draining or stopping the queued reader rejects with that failure

  Scenario: A failure is reported once
    Given a queued command failed and nothing awaited it
    When the failure was already handed to the queue's track function
    Then draining the queue resolves

  Scenario: A failure keeps its error and starts its stack at the test line
    Given a queued check fails
    When the failure is reported
    Then it is the same ScreenReaderAssertionError with expected, phrases, and exitCode
    And the first stack frame is the test line that queued the command

  Scenario: An aborted signal skips pending commands
    Given a queued reader was created with an AbortSignal
    And two commands are queued
    When the signal aborts while the first command runs
    Then the second command never starts
    And it rejects with the signal's reason

  Scenario: The Vitest fixture reports an unawaited failure on the test
    Given a test queues three screen reader commands without awaiting them
    And the second command is an assertion that cannot match
    When the test body finishes
    Then the test fails with that assertion's message before afterEach runs
    And the third command never runs
    And the reported stack starts at the line that queued the second command

  Scenario: The Vitest fixture passes a test that awaits a rejection
    Given a test awaits a queued check inside expect().rejects
    When the check fails
    Then the test passes
    And a command queued after it runs

  Scenario: The Vitest fixture reports a test body error once
    Given a test queues a failing check and then throws its own error
    When the test finishes
    Then the test reports the thrown error only

  Scenario: The browser fixture provides a queued reader
    Given a Vitest browser mode test uses the a11ied/browser test
    When it calls sr.next without await
    Then the command runs against the mounted page

  Scenario: expectOn checks the item under the cursor
    Given the cursor is on a button named "Create account"
    When the test calls expectOn with role "link"
    Then a ScreenReaderAssertionError is thrown
    And its expected value is "link"

  Scenario: expectSpokenInOrder checks the order of announcements
    Given the transcript has "Sign up" before "Create account"
    When the test calls expectSpokenInOrder with "Create account" then "Sign up"
    Then a ScreenReaderAssertionError is thrown
    And its message says which match was not announced after the other

  Scenario: The docs describe the queued style
    Given a reader opens the testing guide, the API reference, or the README
    When they look for how to write a test without await
    Then they find queuedScreenReader, the queued sr fixture, expectOn, and expectSpokenInOrder
    And the Vitest 4 requirement
