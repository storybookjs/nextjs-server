import { dedent } from 'ts-dedent';
import { findUpSync } from 'find-up';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { createLogStream } from '../createLogStream.js';
import { JsPackageManager } from './JsPackageManager.js';
import type { PackageJson } from './PackageJson.js';
import type { InstallationMetadata, PackageMetadata } from './types.js';
import { parsePackageData } from './util.js';

type Yarn1ListItem = {
  name: string;
  children: Yarn1ListItem[];
};

type Yarn1ListData = {
  type: 'list';
  trees: Yarn1ListItem[];
};

export type Yarn1ListOutput = {
  type: 'tree';
  data: Yarn1ListData;
};

const YARN1_ERROR_REGEX = /^error\s(.*)$/gm;

export class Yarn1Proxy extends JsPackageManager {
  readonly type = 'yarn1';

  installArgs: string[] | undefined;

  getInstallArgs(): string[] {
    if (!this.installArgs) {
      this.installArgs = ['--ignore-workspace-root-check'];
    }
    return this.installArgs;
  }

  async initPackageJson() {
    await this.executeCommand({ command: 'yarn', args: ['init', '-y'] });
  }

  getRunStorybookCommand(): string {
    return 'yarn storybook';
  }

  getRunCommand(command: string): string {
    return `yarn ${command}`;
  }

  public runPackageCommandSync(
    command: string,
    args: string[],
    cwd?: string,
    stdio?: 'pipe' | 'inherit'
  ): string {
    return this.executeCommandSync({ command: `yarn`, args: [command, ...args], cwd, stdio });
  }

  async runPackageCommand(command: string, args: string[], cwd?: string): Promise<string> {
    return this.executeCommand({ command: `yarn`, args: [command, ...args], cwd });
  }

  public async getPackageJSON(
    packageName: string,
    basePath = this.cwd
  ): Promise<PackageJson | null> {
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

    return JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, any>;
  }

  public async getPackageVersion(packageName: string, basePath = this.cwd): Promise<string | null> {
    const packageJson = await this.getPackageJSON(packageName, basePath);
    return packageJson ? semver.coerce(packageJson.version)?.version ?? null : null;
  }

  public async findInstallations(pattern: string[]) {
    const commandResult = await this.executeCommand({
      command: 'yarn',
      args: ['list', '--pattern', pattern.map((p) => `"${p}"`).join(' '), '--recursive', '--json'],
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

  protected getResolutions(packageJson: PackageJson, versions: Record<string, string>) {
    return {
      resolutions: {
        ...packageJson.resolutions,
        ...versions,
      },
    };
  }

  protected async runInstall() {
    await this.executeCommand({
      command: 'yarn',
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
        command: 'yarn',
        args: ['add', ...this.getInstallArgs(), ...args],
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
      command: 'yarn',
      args: ['remove', ...this.getInstallArgs(), ...args],
      stdio: 'inherit',
    });
  }

  protected async runGetVersions<T extends boolean>(
    packageName: string,
    fetchAllVersions: T
  ): Promise<T extends true ? string[] : string> {
    const args = [fetchAllVersions ? 'versions' : 'version', '--json'];

    const commandResult = await this.executeCommand({
      command: 'yarn',
      args: ['info', packageName, ...args],
    });

    try {
      const parsedOutput = JSON.parse(commandResult);
      if (parsedOutput.type === 'inspect') {
        return parsedOutput.data;
      }
      throw new Error(`Unable to find versions of ${packageName} using yarn`);
    } catch (e) {
      throw new Error(`Unable to find versions of ${packageName} using yarn`);
    }
  }

  protected mapDependencies(input: Yarn1ListOutput): InstallationMetadata {
    if (input.type === 'tree') {
      const { trees } = input.data;
      const acc: Record<string, PackageMetadata[]> = {};
      const existingVersions: Record<string, string[]> = {};
      const duplicatedDependencies: Record<string, string[]> = {};

      const recurse = (tree: (typeof trees)[0]) => {
        const { children } = tree;
        const { name, value } = parsePackageData(tree.name);
        if (!name || !name.includes('storybook')) return;
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

        children.forEach(recurse);
      };

      trees.forEach(recurse);

      return {
        dependencies: acc,
        duplicatedDependencies,
        infoCommand: 'yarn why',
        dedupeCommand: 'yarn dedupe',
      };
    }

    throw new Error('Something went wrong while parsing yarn output');
  }

  public parseErrorFromLogs(logs: string): string {
    let finalMessage = 'YARN1 error';
    const match = logs.match(YARN1_ERROR_REGEX);

    if (match) {
      const errorMessage = match[0]?.replace(/^error\s(.*)$/, '$1');
      if (errorMessage) {
        finalMessage = `${finalMessage}: ${errorMessage}`;
      }
    }

    return finalMessage.trim();
  }
}
