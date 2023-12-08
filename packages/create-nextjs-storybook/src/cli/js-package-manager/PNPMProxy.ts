import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { dedent } from 'ts-dedent';
import { findUpSync } from 'find-up';
import semver from 'semver';
import { JsPackageManager } from './JsPackageManager.js';
import type { PackageJson } from './PackageJson.js';
import type { InstallationMetadata, PackageMetadata } from './types.js';
import { createLogStream } from '../createLogStream.js';

type PnpmDependency = {
  from: string;
  version: string;
  resolved: string;
  dependencies?: PnpmDependencies;
};

type PnpmDependencies = {
  [key: string]: PnpmDependency;
};

type PnpmListItem = {
  dependencies: PnpmDependencies;
  peerDependencies: PnpmDependencies;
  devDependencies: PnpmDependencies;
};

export type PnpmListOutput = PnpmListItem[];

const PNPM_ERROR_REGEX = /(ELIFECYCLE|ERR_PNPM_[A-Z_]+)\s+(.*)/i;

export class PNPMProxy extends JsPackageManager {
  readonly type = 'pnpm';

  installArgs: string[] | undefined;

  detectWorkspaceRoot() {
    const CWD = process.cwd();

    const pnpmWorkspaceYaml = `${CWD}/pnpm-workspace.yaml`;
    return existsSync(pnpmWorkspaceYaml);
  }

  async initPackageJson() {
    await this.executeCommand({
      command: 'pnpm',
      args: ['init'],
    });
  }

  getRunStorybookCommand(): string {
    return 'pnpm run storybook';
  }

  getRunCommand(command: string): string {
    return `pnpm run ${command}`;
  }

  async getPnpmVersion(): Promise<string> {
    return this.executeCommand({
      command: 'pnpm',
      args: ['--version'],
    });
  }

  getInstallArgs(): string[] {
    if (!this.installArgs) {
      this.installArgs = [];

      if (this.detectWorkspaceRoot()) {
        this.installArgs.push('-w');
      }
    }
    return this.installArgs;
  }

  public runPackageCommandSync(
    command: string,
    args: string[],
    cwd?: string,
    stdio?: 'pipe' | 'inherit'
  ): string {
    return this.executeCommandSync({
      command: 'pnpm',
      args: ['exec', command, ...args],
      cwd,
      stdio,
    });
  }

  async runPackageCommand(command: string, args: string[], cwd?: string): Promise<string> {
    return this.executeCommand({
      command: 'pnpm',
      args: ['exec', command, ...args],
      cwd,
    });
  }

  public async findInstallations(pattern: string[]) {
    const commandResult = await this.executeCommand({
      command: 'pnpm',
      args: ['list', pattern.map((p) => `"${p}"`).join(' '), '--json', '--depth=99'],
      env: {
        FORCE_COLOR: 'false',
      },
    });

    try {
      const parsedOutput = JSON.parse(commandResult);
      return this.mapDependencies(parsedOutput);
    } catch (e) {
      return undefined;
    }
  }

  public async getPackageJSON(
    packageName: string,
    basePath = this.cwd
  ): Promise<PackageJson | null> {
    const pnpapiPath = findUpSync(['.pnp.js', '.pnp.cjs'], { cwd: basePath });

    if (pnpapiPath) {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const pnpApi = require(pnpapiPath);

        const resolvedPath = await pnpApi.resolveToUnqualified(packageName, basePath, {
          considerBuiltins: false,
        });

        const pkgLocator = pnpApi.findPackageLocator(resolvedPath);
        const pkg = pnpApi.getPackageInformation(pkgLocator);

        const packageJSON = JSON.parse(
          readFileSync(join(pkg.packageLocation, 'package.json'), 'utf-8')
        );

        return packageJSON;
      } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') {
          console.error('Error while fetching package version in PNPM PnP mode:', error);
        }
        return null;
      }
    }

    const packageJsonPath = await findUpSync(
      (dir) => {
        const possiblePath = join(dir, 'node_modules', packageName, 'package.json');
        return existsSync(possiblePath) ? possiblePath : undefined;
      },
      { cwd: basePath }
    );

    if (!packageJsonPath) {
      return null;
    }

    return JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  }

  async getPackageVersion(packageName: string, basePath = this.cwd): Promise<string | null> {
    const packageJSON = await this.getPackageJSON(packageName, basePath);

    return packageJSON ? semver.coerce(packageJSON.version)?.version ?? null : null;
  }

  protected getResolutions(packageJson: PackageJson, versions: Record<string, string>) {
    return {
      overrides: {
        ...packageJson.overrides,
        ...versions,
      },
    };
  }

  protected async runInstall() {
    await this.executeCommand({
      command: 'pnpm',
      args: ['install', ...this.getInstallArgs()],
      stdio: 'inherit',
    });
  }

  protected async runAddDeps(dependencies: string[], installAsDevDependencies: boolean) {
    let args = [...dependencies];

    if (installAsDevDependencies) {
      args = ['-D', ...args];
    }
    const { logStream, readLogFile, moveLogFile, removeLogFile } = await createLogStream();

    try {
      await this.executeCommand({
        command: 'pnpm',
        args: ['add', ...args, ...this.getInstallArgs()],
        stdio: process.env.CI ? 'inherit' : ['ignore', logStream, logStream],
      });
    } catch (err) {
      const stdout = await readLogFile();

      const errorMessage = this.parseErrorFromLogs(stdout);

      await moveLogFile();

      throw new Error(
        dedent`${errorMessage}
        
        Please check the logfile generated at ./storybook.log for troubleshooting and try again.`
      );
    }

    await removeLogFile();
  }

  protected async runRemoveDeps(dependencies: string[]) {
    const args = [...dependencies];

    await this.executeCommand({
      command: 'pnpm',
      args: ['remove', ...args, ...this.getInstallArgs()],
      stdio: 'inherit',
    });
  }

  protected async runGetVersions<T extends boolean>(
    packageName: string,
    fetchAllVersions: T
  ): Promise<T extends true ? string[] : string> {
    const args = [fetchAllVersions ? 'versions' : 'version', '--json'];

    const commandResult = await this.executeCommand({
      command: 'pnpm',
      args: ['info', packageName, ...args],
    });

    try {
      const parsedOutput = JSON.parse(commandResult);

      if (parsedOutput.error) {
        // FIXME: improve error handling
        throw new Error(parsedOutput.error.summary);
      } else {
        return parsedOutput;
      }
    } catch (e) {
      throw new Error(`Unable to find versions of ${packageName} using pnpm`);
    }
  }

  protected mapDependencies(input: PnpmListOutput): InstallationMetadata {
    const acc: Record<string, PackageMetadata[]> = {};
    const existingVersions: Record<string, string[]> = {};
    const duplicatedDependencies: Record<string, string[]> = {};
    const items: PnpmDependencies = input.reduce((curr, item) => {
      const { devDependencies, dependencies, peerDependencies } = item;
      const allDependencies = { ...devDependencies, ...dependencies, ...peerDependencies };
      return Object.assign(curr, allDependencies);
    }, {} as PnpmDependencies);

    const recurse = ([name, packageInfo]: [string, PnpmDependency]): void => {
      if (!name || !name.includes('storybook')) return;

      const value = {
        version: packageInfo.version,
        location: '',
      };

      if (!existingVersions[name]?.includes(value.version)) {
        if (acc[name]) {
          acc[name].push(value);
        } else {
          acc[name] = [value];
        }
        existingVersions[name] = [...(existingVersions[name] || []), value.version];

        if (existingVersions[name].length > 1) {
          duplicatedDependencies[name] = existingVersions[name];
        }
      }

      if (packageInfo.dependencies) {
        Object.entries(packageInfo.dependencies).forEach(recurse);
      }
    };
    Object.entries(items).forEach(recurse);

    return {
      dependencies: acc,
      duplicatedDependencies,
      infoCommand: 'pnpm list --depth=1',
      dedupeCommand: 'pnpm dedupe',
    };
  }

  public parseErrorFromLogs(logs: string): string {
    let finalMessage = 'PNPM error';
    const match = logs.match(PNPM_ERROR_REGEX);
    if (match) {
      const [errorCode] = match;
      if (errorCode) {
        finalMessage = `${finalMessage} ${errorCode}`;
      }
    }

    return finalMessage.trim();
  }
}
