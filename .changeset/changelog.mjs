import githubChangelog from '@changesets/changelog-github';

/**
 * The GitHub changelog, minus its "Updated dependencies" list. Every a11ied package moves
 * to the same version in each release, so that list would name every internal package
 * every time and tell a reader nothing.
 */
export default {
   getReleaseLine: githubChangelog.getReleaseLine,
   getDependencyReleaseLine: async () => '',
};
