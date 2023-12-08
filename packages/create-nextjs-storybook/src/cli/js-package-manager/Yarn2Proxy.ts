import { dedent } from 'ts-dedent';
import { findUpSync } from 'find-up';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PosixFS, VirtualFS, ZipOpenFS } from '@yarnpkg/fslib';
import { getLibzipSync } from '@yarnpkg/libzip';
import semver from 'semver';
import { createLogStream } from '../createLogStream.js';
import { JsPackageManager } from './JsPackageManager.js';
import type { PackageJson } from './PackageJson.js';
import type { InstallationMetadata, PackageMetadata } from './types.js';
import { parsePackageData } from './util.js';

const YARN2_ERROR_REGEX = /(YN\d{4}):.*?Error:\s+(.*)/i;
const YARN2_ERROR_CODES = {
  YN0000: 'UNNAMED',
  YN0001: 'EXCEPTION',
  YN0002: 'MISSING_PEER_DEPENDENCY',
  YN0003: 'CYCLIC_DEPENDENCIES',
  YN0004: 'DISABLED_BUILD_SCRIPTS',
  YN0005: 'BUILD_DISABLED',
  YN0006: 'SOFT_LINK_BUILD',
  YN0007: 'MUST_BUILD',
  YN0008: 'MUST_REBUILD',
  YN0009: 'BUILD_FAILED',
  YN0010: 'RESOLVER_NOT_FOUND',
  YN0011: 'FETCHER_NOT_FOUND',
  YN0012: 'LINKER_NOT_FOUND',
  YN0013: 'FETCH_NOT_CACHED',
  YN0014: 'YARN_IMPORT_FAILED',
  YN0015: 'REMOTE_INVALID',
  YN0016: 'REMOTE_NOT_FOUND',
  YN0017: 'RESOLUTION_PACK',
  YN0018: 'CACHE_CHECKSUM_MISMATCH',
  YN0019: 'UNUSED_CACHE_ENTRY',
  YN0020: 'MISSING_LOCKFILE_ENTRY',
  YN0021: 'WORKSPACE_NOT_FOUND',
  YN0022: 'TOO_MANY_MATCHING_WORKSPACES',
  YN0023: 'CONSTRAINTS_MISSING_DEPENDENCY',
  YN0024: 'CONSTRAINTS_INCOMPATIBLE_DEPENDENCY',
  YN0025: 'CONSTRAINTS_EXTRANEOUS_DEPENDENCY',
  YN0026: 'CONSTRAINTS_INVALID_DEPENDENCY',
  YN0027: 'CANT_SUGGEST_RESOLUTIONS',
  YN0028: 'FROZEN_LOCKFILE_EXCEPTION',
  YN0029: 'CROSS_DRIVE_VIRTUAL_LOCAL',
  YN0030: 'FETCH_FAILED',
  YN0031: 'DANGEROUS_NODE_MODULES',
  YN0032: 'NODE_GYP_INJECTED',
  YN0046: 'AUTOMERGE_FAILED_TO_PARSE',
  YN0047: 'AUTOMERGE_IMMUTABLE',
  YN0048: 'AUTOMERGE_SUCCESS',
  YN0049: 'AUTOMERGE_REQUIRED',
  YN0050: 'DEPRECATED_CLI_SETTINGS',
  YN0059: 'INVALID_RANGE_PEER_DEPENDENCY',
  YN0060: 'INCOMPATIBLE_PEER_DEPENDENCY',
  YN0061: 'DEPRECATED_PACKAGE',
  YN0062: 'INCOMPATIBLE_OS',
  YN0063: 'INCOMPATIBLE_CPU',
  YN0068: 'UNUSED_PACKAGE_EXTENSION',
  YN0069: 'REDUNDANT_PACKAGE_EXTENSION',
  YN0071: 'NM_CANT_INSTALL_EXTERNAL_SOFT_LINK',
  YN0072: 'NM_PRESERVE_SYMLINKS_REQUIRED',
  YN0074: 'NM_HARDLINKS_MODE_DOWNGRADED',
  YN0075: 'PROLOG_INSTANTIATION_ERROR',
  YN0076: 'INCOMPATIBLE_ARCHITECTURE',
  YN0077: 'GHOST_ARCHITECTURE',
};

// This encompasses both yarn 2 and yarn 3
export class Yarn2Proxy extends JsPackageManager {
  readonly type = 'yarn2';

  installArgs: string[] | undefined;

  getInstallArgs(): string[] {
    if (!this.installArgs) {
      this.installArgs = [];
    }
    return this.installArgs;
  }

  async initPackageJson() {
    await this.executeCommand({ command: 'yarn', args: ['init'] });
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
  ) {
    return this.executeCommandSync({ command: 'yarn', args: [command, ...args], cwd, stdio });
  }

  async runPackageCommand(command: string, args: string[], cwd?: string) {
    return this.executeCommand({ command: 'yarn', args: [command, ...args], cwd });
  }

  public async findInstallations(pattern: string[]) {
    const commandResult = await this.executeCommand({
      command: 'yarn',
      args: [
        'info',
        '--name-only',
        '--recursive',
        pattern.map((p) => `"${p}"`).join(' '),
        `"${pattern}"`,
      ],
      env: {
        FORCE_COLOR: 'false',
      },
    });

    try {
      return this.mapDependencies(commandResult);
    } catch (e) {
      return undefined;
    }
  }

  async getPackageJSON(packageName: string, basePath = this.cwd): Promise<PackageJson | null> {
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

        const zipOpenFs = new ZipOpenFS({
          libzip: getLibzipSync(),
        });

        const virtualFs = new VirtualFS({ baseFs: zipOpenFs });
        const crossFs = new PosixFS(virtualFs);

        const virtualPath = join(pkg.packageLocation, 'package.json');

        return crossFs.readJsonSync(virtualPath);
      } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') {
          console.error('Error while fetching package version in Yarn PnP mode:', error);
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

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson;
  }

  async getPackageVersion(packageName: string, basePath = this.cwd): Promise<string | null> {
    const packageJSON = await this.getPackageJSON(packageName, basePath);
    return packageJSON ? semver.coerce(packageJSON.version)?.version ?? null : null;
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
    const field = fetchAllVersions ? 'versions' : 'version';
    const args = ['--fields', field, '--json'];

    const commandResult = await this.executeCommand({
      command: 'yarn',
      args: ['npm', 'info', packageName, ...args],
    });

    try {
      const parsedOutput = JSON.parse(commandResult);
      return parsedOutput[field];
    } catch (e) {
      throw new Error(`Unable to find versions of ${packageName} using yarn 2`);
    }
  }

  protected mapDependencies(input: string): InstallationMetadata {
    const lines = input.split('\n');
    const acc: Record<string, PackageMetadata[]> = {};
    const existingVersions: Record<string, string[]> = {};
    const duplicatedDependencies: Record<string, string[]> = {};

    lines.forEach((packageName) => {
      if (!packageName || !packageName.includes('storybook')) {
        return;
      }

      const { name, value } = parsePackageData(packageName.replaceAll(`"`, ''));
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
    });

    return {
      dependencies: acc,
      duplicatedDependencies,
      infoCommand: 'yarn why',
      dedupeCommand: 'yarn dedupe',
    };
  }

  public parseErrorFromLogs(logs: string): string {
    let finalMessage = 'YARN2 error';
    const match = logs.match(YARN2_ERROR_REGEX);

    if (match) {
      const errorCode = match[1] as keyof typeof YARN2_ERROR_CODES;
      if (errorCode) {
        finalMessage = `${finalMessage} ${errorCode}`;
      }

      const errorType = YARN2_ERROR_CODES[errorCode];
      if (errorType) {
        finalMessage = `${finalMessage} - ${errorType}`;
      }

      const errorMessage = match[2];
      if (errorMessage) {
        finalMessage = `${finalMessage}: ${errorMessage}`;
      }
    }

    return finalMessage.trim();
  }
}
