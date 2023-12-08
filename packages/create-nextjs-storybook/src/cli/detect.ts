import fs from 'fs';
import { findUpSync } from 'find-up';
import semver from 'semver';
import { resolve } from 'path';

const logger = console;

import type { JsPackageManager } from './js-package-manager/index.js';

export enum SupportedLanguage {
  JAVASCRIPT = 'javascript',
  TYPESCRIPT_3_8 = 'typescript-3-8',
  TYPESCRIPT_4_9 = 'typescript-4-9',
}

export function isStorybookInstantiated(configDir = resolve(process.cwd(), '.storybook')) {
  return fs.existsSync(configDir);
}

export async function detectPnp() {
  return !!findUpSync(['.pnp.js', '.pnp.cjs']);
}

export async function detectLanguage(packageManager: JsPackageManager) {
  let language = SupportedLanguage.JAVASCRIPT;

  if (fs.existsSync('jsconfig.json')) {
    return language;
  }

  const isTypescriptDirectDependency = await packageManager
    .getAllDependencies()
    .then((deps) => Boolean(deps['typescript']));

  const typescriptVersion = await packageManager.getPackageVersion('typescript');
  const prettierVersion = await packageManager.getPackageVersion('prettier');
  const babelPluginTransformTypescriptVersion = await packageManager.getPackageVersion(
    '@babel/plugin-transform-typescript'
  );
  const typescriptEslintParserVersion = await packageManager.getPackageVersion(
    '@typescript-eslint/parser'
  );

  const eslintPluginStorybookVersion = await packageManager.getPackageVersion(
    'eslint-plugin-storybook'
  );

  if (isTypescriptDirectDependency && typescriptVersion) {
    if (
      semver.gte(typescriptVersion, '4.9.0') &&
      (!prettierVersion || semver.gte(prettierVersion, '2.8.0')) &&
      (!babelPluginTransformTypescriptVersion ||
        semver.gte(babelPluginTransformTypescriptVersion, '7.20.0')) &&
      (!typescriptEslintParserVersion || semver.gte(typescriptEslintParserVersion, '5.44.0')) &&
      (!eslintPluginStorybookVersion || semver.gte(eslintPluginStorybookVersion, '0.6.8'))
    ) {
      language = SupportedLanguage.TYPESCRIPT_4_9;
    } else if (semver.gte(typescriptVersion, '3.8.0')) {
      language = SupportedLanguage.TYPESCRIPT_3_8;
    } else if (semver.lt(typescriptVersion, '3.8.0')) {
      logger.warn('Detected TypeScript < 3.8, populating with JavaScript examples');
    }
  }

  return language;
}
