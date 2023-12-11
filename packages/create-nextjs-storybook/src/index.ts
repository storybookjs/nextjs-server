#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { cp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dedent } from 'ts-dedent';
import boxen from 'boxen';
import chalk from 'chalk';
import { join } from 'path';
import { render } from 'ejs';
import ora from 'ora';

import { JsPackageManagerFactory } from './cli/js-package-manager/index.js';
import type { PackageManagerName } from './cli/js-package-manager/index.js';
import { HandledError } from './cli/HandledError.js';
import { SupportedLanguage, detectLanguage } from './cli/detect.js';
import { addWithStorybook } from './addWithStorybook.js';
import { codeLog } from './cli/helpers.js';

const logger = console;

const DIRNAME = new URL('.', import.meta.url).pathname;
const VERSION = '0.0.0-pr-25086-sha-b3010f16';

const ensureDirShallow = async (path: string) => mkdir(path).catch(() => {});

const getEmptyDirMessage = (packageManagerType: PackageManagerName) => {
  const generatorCommandsMap = {
    npm: 'npm create',
    yarn1: 'yarn create',
    yarn2: 'yarn create',
    pnpm: 'pnpm create',
  };

  const create = generatorCommandsMap[packageManagerType];

  return dedent`
    Storybook-NextJS-Server cannot be installed into an empty project.
      
    Please create a new NextJS project using ${chalk.green(
      create + ' next-app'
    )} or any other tooling of your choice.

    Once you've created the project, please re-run ${chalk.green(
      create + 'storybook-nextjs'
    )} inside the project root.
    
    For more information, see ${chalk.yellowBright('https://storybook.js.org/docs')}.
    Good luck! 🚀
  `;
};

const isAppDir = (projectRoot: string) => {
  return existsSync(join(projectRoot, 'app')) || existsSync(join(projectRoot, 'src', 'app'));
};

interface CreateOptions {
  srcDir: string;
  appDir: boolean;
  language: SupportedLanguage;
  addons: string[];
}

const formatArray = (arr: string[]) => `[${arr.map((item) => `'${item}'`).join(', ')}]`;

const createConfig = async ({ appDir, language, srcDir, addons }: CreateOptions) => {
  const templateDir = join(DIRNAME, '..', 'templates', 'sb');
  const configDir = join(process.cwd(), '.storybook');

  await ensureDirShallow(configDir);

  if (!appDir) {
    const previewFile = language == SupportedLanguage.JAVASCRIPT ? 'preview.jsx' : 'preview.tsx';
    await cp(join(templateDir, previewFile), join(configDir, previewFile));
  }

  const mainExt = language === SupportedLanguage.JAVASCRIPT ? 'js' : 'ts';
  const stories = formatArray([`../${srcDir}**/*.stories.@(js|jsx|ts|tsx)`]);
  const extras =
    "framework: '@storybook/nextjs-server',\n" + (appDir ? '' : "  docs: { autodocs: 'tag' },\n");

  const mainTemplate = await readFile(join(templateDir, `main.${mainExt}.ejs`), 'utf-8');
  const main = render(mainTemplate, { stories, addons: formatArray(addons), extras });
  await writeFile(join(configDir, `main.${mainExt}`), main);
};

const createStories = async ({ srcDir, appDir, language }: CreateOptions) => {
  const ext = language === SupportedLanguage.JAVASCRIPT ? 'js' : 'ts';
  const templateDir = join(DIRNAME, '..', 'templates');
  const storiesDir = join(templateDir, appDir ? 'app' : 'pages', ext);
  const outputDir = join(process.cwd(), srcDir, 'stories');

  await cp(storiesDir, outputDir, { recursive: true });

  await Promise.all(
    ['page', 'header', 'button'].map((fname) =>
      cp(join(templateDir, 'css', `${fname}.module.css`), join(outputDir, `${fname}.module.css`))
    )
  );
};

/**
 * NextJS app router has problems if the routes are created dynamically on
 * first startup, so let's try to create them on install.
 */
const createRoutes = async ({ srcDir, appDir, language }: CreateOptions) => {
  if (!appDir) return;
  const templateDir = join(DIRNAME, '..', 'templates', 'app', 'groupLayouts');

  const groupDir = join(srcDir, 'app', '(sb)');
  await ensureDirShallow(groupDir);
  await cp(join(templateDir, 'layout-root.tsx'), join(groupDir, 'layout.tsx'));

  const previewDir = join(groupDir, 'storybook-preview');
  await ensureDirShallow(previewDir);
  await cp(join(templateDir, 'layout-nested.tsx'), join(previewDir, 'layout.tsx'));
};

const updateNextConfig = async () => {
  const nextConfigPath = join(process.cwd(), 'next.config.js');

  let nextConfig = 'module.exports = {}';
  if (existsSync(nextConfigPath)) {
    nextConfig = await readFile(nextConfigPath, 'utf-8');
  }
  const updatedConfig = addWithStorybook(nextConfig);
  await writeFile(nextConfigPath, updatedConfig);
};

const _version = (pkgs: string[]) => pkgs.map((pkg) => `${pkg}@${VERSION}`);

const init = async () => {
  let done = false;
  const spinner = ora('Adding Storybook').start();

  // add a slight delay so that user can see what's going on
  const status = (msg: string, delay: number) => {
    setTimeout(() => {
      if (!done) spinner.text = msg;
    }, delay);
  };

  // FIXME:
  // - telemetry
  // - force package manager
  // - force install
  // - pnp
  const entries = await readdir(process.cwd());
  const isEmptyDir = entries.length === 0 || entries.every((entry) => entry.startsWith('.'));
  const packageManager = JsPackageManagerFactory.getPackageManager();

  if (isEmptyDir) {
    logger.log(
      boxen(getEmptyDirMessage(packageManager.type), {
        borderStyle: 'round',
        padding: 1,
        borderColor: '#F1618C',
      })
    );
    throw new HandledError('Project was initialized in an empty directory.');
  }

  const language = await detectLanguage(packageManager);

  const appDir = isAppDir(process.cwd());
  const corePackages = ['storybook', '@storybook/react'];
  const addons = appDir
    ? ['@storybook/addon-controls']
    : [
        '@storybook/addon-essentials',
        '@storybook/blocks',
        '@storybook/addon-interactions',
        '@storybook/test',
      ];

  const options = {
    srcDir: existsSync(join(process.cwd(), 'src')) ? 'src/' : '',
    appDir,
    language,
    addons,
  };
  status('Creating .storybook config', 500);
  await createConfig(options);
  status('Creating example stories', 1000);
  await createStories(options);
  await createRoutes(options);
  await updateNextConfig();
  status('Installing package dependencies', 1500);
  await packageManager.addDependencies({ installAsDevDependencies: true }, [
    '@storybook/nextjs-server',
    ..._version([...corePackages, ...addons]),
  ]);

  done = true;
  spinner.succeed('Done!');

  logger.log(`\n1️⃣  Update ${chalk.bold(chalk.cyan('next.config.js'))}:\n`);
  codeLog([
    "const withStorybook = require('@storybook/nextjs-server/next-config')({/* sb config */});",
    'module.exports = withStorybook({/* next config */});',
  ]);
  logger.log('\n2️⃣  Run your NextJS app:\n');
  codeLog([packageManager.getRunCommand('dev')]);
  logger.log('\n3️⃣  View your Storybook:\n');
  logger.log(chalk.bold(chalk.cyan('  https://localhost:3000/storybook')));
  logger.log();
};

init().catch((e) => {
  console.error(e);
});
