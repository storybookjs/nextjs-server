import type { Builder } from '@storybook/types';

interface NullStats {
  toJson: () => any;
}
export type NullBuilder = Builder<{}, NullStats>;

export const start: NullBuilder['start'] = async () => {};

export const build: NullBuilder['build'] = async () => {};

export const bail: NullBuilder['bail'] = async () => {};
