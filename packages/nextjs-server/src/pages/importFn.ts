/* eslint-disable no-underscore-dangle */
import type { ModuleExports, StoryIndex } from '@storybook/types';
import type { useRouter } from 'next/navigation';

type Path = string;

const csfFiles: Record<Path, ModuleExports> = {};
const csfResolvers: Record<Path, (moduleExports: ModuleExports) => void> = {};
const csfPromises: Record<Path, Promise<ModuleExports>> = {};
// @ts-ignore FIXME
let useEffect = (_1: any, _2: any) => {};
if (typeof window !== 'undefined') {
  window.FEATURES = { storyStoreV7: true };

  window._storybook_onImport = (path: Path, moduleExports: ModuleExports) => {
    console.log('_storybook_onImport', path, Object.keys(csfFiles), Object.keys(csfResolvers));
    csfFiles[path] = moduleExports;
    csfResolvers[path]?.(moduleExports);
  };

  useEffect = (cb, _) => cb();
}

export const importFn = async (
  allEntries: StoryIndex['entries'],
  router: ReturnType<typeof useRouter>,
  previewPath: Path,
  path: Path
) => {
  console.log('importing', path);

  if (csfFiles[path]) {
    console.log('got it already, short circuiting');
    return csfFiles[path];
  }

  // @ts-expect-error TS is confused, this is not a bug
  if (csfPromises[path]) {
    console.log('got promise, short circuiting');
    return csfPromises[path];
  }

  // Find all index entries for this import path, to find a story id
  const entries = Object.values(allEntries || []).filter(
    ({ importPath }: any) => importPath === path
  ) as { id: string; name: string; title: string }[];

  if (entries.length === 0) throw new Error(`Couldn't find import path ${path}, this is odd`);

  const firstStoryId = entries[0].id;
  const componentId = firstStoryId.split('--')[0];

  csfPromises[path] = new Promise((resolve) => {
    csfResolvers[path] = resolve;
  });

  router.push(`/${previewPath}/${componentId}`);

  return csfPromises[path];
};
