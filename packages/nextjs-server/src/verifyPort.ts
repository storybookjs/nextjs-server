import { join, dirname } from 'path';
import { ensureDir, exists, writeFile } from 'fs-extra';

interface VerifyOptions {
  pid: number;
  ppid: number;
  port: string | number;
  appDir: boolean;
  previewPath: string;
}

const writePidFilePages = async ({ previewPath }: VerifyOptions) => {
  const pidFile = join(process.cwd(), 'pages', previewPath, 'pid.tsx');

  if (await exists(pidFile)) return;

  await ensureDir(dirname(pidFile));
  const pidTsx = `
    import type { InferGetServerSidePropsType, GetServerSideProps } from 'next'

    export const getServerSideProps = (async () => {
      return { props: { ppid: process.ppid } }
    }) satisfies GetServerSideProps<{ ppid: number }>;

    export default function Page(
      { ppid }: InferGetServerSidePropsType<typeof getServerSideProps>
    ) {
      const ppidTag = '__ppid_' + ppid + '__';
      return <>{ppidTag}</>;
    };
    `;
  await writeFile(pidFile, pidTsx);
};

const writePidFileApp = async ({ previewPath }: VerifyOptions) => {
  const pidFile = join(process.cwd(), 'app', '(sb)', previewPath, 'pid', 'page.tsx');

  if (await exists(pidFile)) return;

  await ensureDir(dirname(pidFile));
  const pidTsx = `
    const page = () => {
      const ppidTag = '__ppid_' + process.ppid + '__';
      return <>{ppidTag}</>;
    };
    export default page;`;
  await writeFile(pidFile, pidTsx);
};

const PPID_RE = /__ppid_(\d+)__/;
const checkPidRoute = async ({ pid, ppid, port, previewPath }: VerifyOptions) => {
  const res = await fetch(`http://localhost:${port}/${previewPath}/pid`);
  const pidHtml = await res.text();
  const match = PPID_RE.exec(pidHtml);
  const pidMatch = match?.[1].toString();

  if (pidMatch === pid.toString() || pidMatch === ppid.toString()) {
    console.log(`Verified NextJS pid ${pidMatch} is running on port ${port}`);
  } else {
    console.error(`NextJS server failed to start on port ${port}`);
    console.error(`Wanted pid ${pid} or parent ${ppid}, got ${pidMatch}`);
    console.error(`${pid.toString() === pidMatch} || ${ppid.toString() === pidMatch}`);
    process.exit(1);
  }
};

/**
 * Helper function to verify that the NextJS
 * server is actually running on the port we
 * requested. Since NextJS can run multiple
 * processes, defer to the parent process if
 * it has already written to the pid file.
 */
export const verifyPort = (
  port: string | number,
  { appDir, previewPath }: { appDir: boolean; previewPath: string }
) => {
  const { pid, ppid } = process;

  setTimeout(async () => {
    try {
      const writePidFile = appDir ? writePidFileApp : writePidFilePages;
      await writePidFile({ pid, ppid, port, appDir, previewPath });
      setTimeout(
        () => checkPidRoute({ pid, ppid, port, appDir, previewPath }),
        parseInt(process.env.STORYBOOK_VERIFY_PORT_DELAY ?? '100', 10)
      );
    } catch (e) {
      console.error(e);
    }
  }, 200);
};
