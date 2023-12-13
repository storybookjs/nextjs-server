import { existsSync } from 'fs';
import { ensureDirSync } from 'fs-extra';
import { join } from 'path';

interface Options {
  /**
   * Create the directory if it doesn't exist. This is useful if
   * we've already determined what type of project we're running in
   * (pages vs app), but we want to handle the case where the
   * directory has been deleted out from under us.
   *
   * When creating the directory, we prefer `src/{pages,app}` if
   * a `src` directory exists.
   */
  createIfMissing?: boolean;
}

const getDirOrSrcDir = (pagesOrApp: string, { createIfMissing }: Options) => {
  const cwd = process.cwd();

  const rootDir = join(cwd, pagesOrApp);
  if (existsSync(rootDir)) return rootDir;

  const srcDir = join(cwd, 'src');
  const srcRootDir = join(srcDir, pagesOrApp);
  if (existsSync(srcRootDir)) return srcRootDir;

  if (createIfMissing) {
    const toCreate = existsSync(srcDir) ? srcRootDir : rootDir;
    ensureDirSync(toCreate);
    return toCreate;
  }

  return undefined;
};

export const getAppDir = (options: Options) => getDirOrSrcDir('app', options);

export const getPagesDir = (options: Options) => getDirOrSrcDir('pages', options);
