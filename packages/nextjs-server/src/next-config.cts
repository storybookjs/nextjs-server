import type { NextConfig } from 'next';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import type { StorybookNextJSOptions } from './types';
import { verifyPort } from './verifyPort';
import { getAppDir } from './utils';

const logger = console;
let childProcess: ChildProcess | undefined;

[
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
].forEach((sig) => {
  process.on(sig, () => {
    if (childProcess) {
      logger.log('Stopping storybook');
      childProcess.kill();
    }
  });
});

function addRewrites(
  existing: NextConfig['rewrites'] | undefined,
  ourRewrites: { source: string; destination: string }[]
): NextConfig['rewrites'] {
  if (!existing) return async () => ourRewrites;

  return async () => {
    const existingRewrites = await existing();

    if (Array.isArray(existingRewrites)) return [...existingRewrites, ...ourRewrites];

    return {
      ...existingRewrites,
      fallback: [...existingRewrites.fallback, ...ourRewrites],
    };
  };
}

interface WithStorybookOptions {
  /**
   * Port that the Next.js app will run on.
   * @default 3000
   */
  port: string | number;

  /**
   * Internal port that Storybook will run on.
   * @default 34567
   */
  sbPort: string | number;

  /**
   * URL path to Storybook's "manager" UI.
   * @default 'storybook'
   */
  managerPath: string;

  /**
   * URL path to Storybook's story preview iframe.
   * @default 'storybook-preview'
   */
  previewPath: string;

  /**
   * Directory where Storybook's config files are located.
   * @default '.storybook'
   */
  configDir: string;

  /**
   * Whether to use the NextJS app directory.
   * @default undefined
   */
  appDir: boolean;
}

const withStorybook = ({
  port = process.env.PORT ?? 3000,
  sbPort = 34567,
  managerPath = 'storybook',
  previewPath = 'storybook-preview',
  configDir = '.storybook',
  appDir = undefined,
}: Partial<WithStorybookOptions> = {}) => {
  const isAppDir = appDir ?? !!getAppDir({ createIfMissing: false });
  const storybookNextJSOptions: StorybookNextJSOptions = {
    appDir: isAppDir,
    managerPath,
    previewPath,
  };

  childProcess = spawn(
    'npm',
    [
      'exec',
      'storybook',
      '--',
      'dev',
      '--preview-url',
      `http://localhost:${port}/${previewPath}`,
      '-p',
      sbPort.toString(),
      '--ci',
      // NOTE that this is still a race condition. However, if two instances of SB use the exact port,
      // the second will fail and the first will still be running, which is what we want. There must be
      // a more graceful way to handle this.
      '--exact-port',
      '--config-dir',
      configDir,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, STORYBOOK_NEXTJS_OPTIONS: JSON.stringify(storybookNextJSOptions) },
    }
  );

  verifyPort(port, { appDir: isAppDir, previewPath });

  return (config: NextConfig) => ({
    ...config,
    rewrites: addRewrites(config.rewrites, [
      {
        source: '/logo.svg',
        destination: `http://localhost:${sbPort}/logo.svg`,
      },
      {
        source: `/${managerPath}/:path*`,
        destination: `http://localhost:${sbPort}/:path*`,
      },
      {
        source: '/sb-manager/:path*',
        destination: `http://localhost:${sbPort}/sb-manager/:path*`,
      },
      {
        source: '/sb-common-assets/:path*',
        destination: `http://localhost:${sbPort}/sb-common-assets/:path*`,
      },
      {
        source: '/sb-preview/:path*',
        destination: `http://localhost:${sbPort}/sb-preview/:path*`,
      },
      {
        source: '/sb-addons/:path*',
        destination: `http://localhost:${sbPort}/sb-addons/:path*`,
      },
      {
        source: '/storybook-server-channel',
        destination: `http://localhost:${sbPort}/storybook-server-channel`,
      },
      {
        source: '/index.json',
        destination: `http://localhost:${sbPort}/index.json`,
      },
      {
        source: `/${previewPath}/index.json`,
        destination: `http://localhost:${sbPort}/index.json`,
      },
    ]),
  });
};

module.exports = withStorybook;
