import githubChangelog from '@changesets/changelog-github';

const THANKS = / Thanks (?<users>\[@[^\]]+\]\([^)]+\)(?:, \[@[^\]]+\]\([^)]+\))*)!/u;

const USER_LOGIN = /^\[@(?<login>[^\]]+)\]/u;

/**
 * Keeps the "Thanks @user!" credit for outside contributors only. A maintainer's own
 * entry would thank them in their own changelog, which tells a reader nothing.
 */
function removeMaintainerThanks(line, maintainers) {
   return line.replace(THANKS, (_match, users) => {
      const contributors = users
         .split(', ')
         .filter((user) => !maintainers.includes(USER_LOGIN.exec(user)?.groups.login));

      return contributors.length > 0 ? ` Thanks ${contributors.join(', ')}!` : '';
   });
}

/**
 * The GitHub changelog, minus its "Updated dependencies" list and the thanks to
 * maintainers listed in `maintainers` in config.json. Every a11ied package moves to the
 * same version in each release, so that list would name every internal package every time
 * and tell a reader nothing.
 */
export default {
   getReleaseLine: async (changeset, type, options) => {
      const line = await githubChangelog.getReleaseLine(changeset, type, options);

      return removeMaintainerThanks(line, options?.maintainers ?? []);
   },
   getDependencyReleaseLine: async () => '',
};
