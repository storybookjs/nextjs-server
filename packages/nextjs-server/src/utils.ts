import { existsSync } from 'fs';
import { join } from 'path';

const getRootDir = (pagesOrApp: string) => {
  const cwd = process.cwd();

  let rootDir = join(cwd, pagesOrApp);
  if (existsSync(rootDir)) return rootDir;

  rootDir = join(cwd, 'src', pagesOrApp);
  if (existsSync(rootDir)) return rootDir;

  return undefined;
};

export const getAppDir = () => getRootDir('app');

export const getPagesDir = () => getRootDir('pages');

export const getSrcDir = () => {
  const cwd = process.cwd();
  let srcDir = join(cwd, 'src');
  if (existsSync(srcDir)) return srcDir;
  return cwd;
};
