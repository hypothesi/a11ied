import packageJson from '../package.json' with { type: 'json' };

/** Every a11ied package shares one version, so this is also the version of a1. */
export const PACKAGE_VERSION: string = packageJson.version;
