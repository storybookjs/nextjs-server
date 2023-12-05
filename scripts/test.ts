import { remove, move, outputFile } from 'fs-extra';
import { temporaryDirectory } from 'tempy';
import { execa } from 'execa';
import { join, resolve } from 'path';
import { dedent } from 'ts-dedent';

const version = '0.0.0-pr-25086-sha-fa16f873';
const initCommandPath = resolve('../packages/create-nextjs-storybook/dist/index.js');
const packagePath = resolve('../packages/nextjs-server');

const sbPackages = [
  '@storybook/addon-essentials',
  '@storybook/addon-interactions',
  '@storybook/addon-links',
  '@storybook/blocks',
  '@storybook/nextjs-server',
  '@storybook/react',
  'storybook',
];

async function createSandbox({ dirName, appDir = true }: { dirName: string; appDir?: boolean }) {
  await remove(join(process.cwd(), dirName));

  const createCommand = `pnpm create next-app ${dirName} --typescript --no-src-dir --no-eslint --no-tailwind --import-alias=@/* ${
    appDir ? '--app' : '--no-app'
  }`;
  await execa(createCommand.split(' ')[0], createCommand.split(' ').slice(1), { stdio: 'inherit' });

  await execa('node', [initCommandPath], {
    cwd: dirName,
    stdio: 'inherit',
  });

  const linkCommand = `pnpm link ${packagePath}`;
  await execa(linkCommand.split(' ')[0], linkCommand.split(' ').slice(1), {
    cwd: dirName,
    stdio: 'inherit',
  });

  // const initCommand = `npx sb@${version} init --yes`;
  // await execa(initCommand.split(' ')[0], initCommand.split(' ').slice(1), {
  //   cwd: dirName,
  //   stdio: 'inherit',
  // });

  // // Workaround issue in SB init where it always installs the latest version of packages
  // await execa('yarn', ['add', '--dev', ...sbPackages.map((name) => `${name}@${version}`)], {
  //   cwd: dirName,
  //   stdio: 'inherit',
  // });

  const nextConfig = dedent`const withStorybook  = require('@storybook/nextjs-server/next-config')();
    const nextConfig = withStorybook({
      /* your custom config here */
    });
    module.exports = nextConfig;`;
  outputFile(`${dirName}/next.config.js`, nextConfig);
}

async function startSandbox({ dirName }: { dirName: string }) {
  execa('yarn', ['dev'], {
    cwd: dirName,
    stdio: 'inherit',
  });
}

async function go() {
  const appDir = process.env.APP_DIR !== 'false';

  const dirName = temporaryDirectory();
  await createSandbox({ dirName, appDir });
  await startSandbox({ dirName });
}

go()
  .then(() => console.log('done'))
  .catch((err) => console.log(err));
