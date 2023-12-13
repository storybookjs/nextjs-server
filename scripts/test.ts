import fsExtra from 'fs-extra';
import { temporaryDirectory } from 'tempy';
import { execa } from 'execa';
import { join, resolve } from 'path';
import { dedent } from 'ts-dedent';

const { remove, outputFile, readJson } = fsExtra;

const initCommandPath = resolve('../packages/create-nextjs-storybook/dist/index.js');
const packagePath = resolve('../packages/nextjs-server');

async function createSandbox({
  dirName,
  appDir = true,
  srcDir = false,
}: {
  dirName: string;
  appDir?: boolean;
  srcDir?: boolean;
}) {
  await remove(join(process.cwd(), dirName));

  const app = appDir ? '--app' : '--no-app';
  const src = srcDir ? '--src-dir' : '--no-src-dir';
  const createCommand = `pnpm create next-app ${dirName} --typescript --no-eslint --no-tailwind --import-alias=@/* ${app} ${src}`;
  await execa(createCommand.split(' ')[0], createCommand.split(' ').slice(1), { stdio: 'inherit' });

  await execa('node', [initCommandPath], {
    cwd: dirName,
    stdio: 'inherit',
  });

  const { version } = await readJson('../packages/nextjs-server/package.json');
  const installTarballCommand = `pnpm add -D ${packagePath}/storybook-nextjs-server-${version}.tgz`;
  await execa(installTarballCommand.split(' ')[0], installTarballCommand.split(' ').slice(1), {
    cwd: dirName,
    stdio: 'inherit',
  });

  const nextConfig = dedent`const withStorybook  = require('@storybook/nextjs-server/next-config')();
    const nextConfig = withStorybook({
      /* your custom config here */
    });
    module.exports = nextConfig;`;
  outputFile(`${dirName}/next.config.js`, nextConfig);
}

async function startSandbox({ dirName }: { dirName: string }) {
  execa('pnpm', ['dev'], {
    cwd: dirName,
    stdio: 'inherit',
  });
}

async function go() {
  const appDir = process.env.APP_DIR !== 'false';
  const srcDir = process.env.SRC_DIR && process.env.SRC_DIR !== 'false';

  const dirName = temporaryDirectory();
  await createSandbox({ dirName, appDir, srcDir });
  await startSandbox({ dirName });
}

go()
  .then(() => console.log('done'))
  .catch((err) => console.log(err));
