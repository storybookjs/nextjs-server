import type { StorybookConfig as StorybookConfigBase } from '@storybook/types';

type FrameworkName = '@storybook/nextjs-server';

export type FrameworkOptions = {
  builder?: {};
};

type StorybookConfigFramework = {
  framework:
    | FrameworkName
    | {
        name: FrameworkName;
        options: FrameworkOptions;
      };
};

/**
 * The interface for Storybook configuration in `main.ts` files.
 */
export type StorybookConfig = StorybookConfigBase & StorybookConfigFramework;

export interface StorybookNextJSOptions {
  appDir: boolean;
  managerPath: string;
  previewPath: string;
}
