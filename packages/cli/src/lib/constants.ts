import packageJson from '../../package.json' with { type: 'json' };

export const CLI_VERSION = packageJson.version;
export const PACKAGE_NAME = packageJson.name;
export const JSON_INDENT = 2;
