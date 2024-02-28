/* eslint-disable no-underscore-dangle */
import React from 'react';
import { useRouter } from 'next/navigation.js';
import type { Renderer } from '@storybook/csf';
import { createBrowserChannel } from '@storybook/channels';
import { PreviewWithSelection, addons, UrlStore, WebView } from '@storybook/preview-api';

import { previewHtml } from './previewHtml';
import { importFn } from './importFn';

// A version of the URL store that doesn't change route when the selection changes
// (as we change the URL as part of rendering the story)
class StaticUrlStore extends UrlStore {
  setSelection(selection: Parameters<typeof UrlStore.prototype.setSelection>[0]) {
    this.selection = selection;
  }
}

type GetProjectAnnotations = Parameters<
  PreviewWithSelection<Renderer>['initialize']
>[0]['getProjectAnnotations'];

export const Preview = ({
  getProjectAnnotations,
  previewPath,
}: {
  getProjectAnnotations: GetProjectAnnotations;
  previewPath: string;
}) => {
  const router = useRouter();

  // We can't use React's useEffect in the monorepo because of dependency issues,
  // but we only need to ensure code runs *once* on the client only, so let's just make
  // our own version of that
  if (typeof window !== 'undefined') {
    if (!window.__STORYBOOK_PREVIEW__) {
      console.log('creating preview', { getProjectAnnotations, StaticUrlStore, WebView });
      const channel = createBrowserChannel({ page: 'preview' });
      addons.setChannel(channel);
      window.__STORYBOOK_ADDONS_CHANNEL__ = channel;

      const previewImportFn = (path: string) =>
        importFn(preview.storyStore.storyIndex!.entries, router, previewPath, path);
      const preview = new PreviewWithSelection(
        previewImportFn,
        getProjectAnnotations,
        new StaticUrlStore(),
        new WebView()
      );

      window.__STORYBOOK_PREVIEW__ = preview;
    }

    // Render the the SB UI (ie iframe.html / preview.ejs) in a non-react way to ensure
    // it doesn't get ripped down when a new route renders
    if (!document.querySelector('#storybook-root')) {
      document.body.innerHTML += previewHtml;
    }
  }

  return <></>;
};
