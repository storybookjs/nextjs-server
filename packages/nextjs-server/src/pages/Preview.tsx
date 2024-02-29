/* eslint-disable no-underscore-dangle */
import React, { useEffect } from 'react';
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

if (typeof window !== 'undefined') {
  window.isInSBMode = false;
}

enum Mode {
  'MAIN' = 'MAIN',
  'NOPREVIEW' = 'NOPREVIEW',
  'PREPARING_STORY' = 'PREPARING_STORY',
  'PREPARING_DOCS' = 'PREPARING_DOCS',
  'ERROR' = 'ERROR',
}
const classes: Record<Mode, string> = {
  PREPARING_STORY: 'sb-show-preparing-story',
  PREPARING_DOCS: 'sb-show-preparing-docs',
  MAIN: 'sb-show-main',
  NOPREVIEW: 'sb-show-nopreview',
  ERROR: 'sb-show-errordisplay',
};

class MaybeWebView extends WebView {
  showMode(mode: any) {
    clearTimeout(this.preparingTimeout);
    Object.keys(Mode).forEach((otherMode) => {
      if (otherMode === mode) {
        document.querySelector('#storybook-body').classList.add(classes[otherMode]);
      } else {
        document.querySelector('#storybook-body').classList.remove(classes[otherMode as Mode]);
      }
    });
  }
  showStoryDuringRender() {}
  applyLayout() {}

  storyRoot() {
    return document.querySelector('#storybook-body #storybook-root');
  }

  docsRoot() {
    return document.querySelector('#storybook-body #storybook-docs');
  }
}

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
        new MaybeWebView()
      );

      window.__STORYBOOK_PREVIEW__ = preview;

      // hack for a sec
      window.__NEXT_ROUTER = router;
    }

    setTimeout(() => {
      // Render the the SB UI (ie iframe.html / preview.ejs) in a non-react way to ensure
      // it doesn't get ripped down when a new route renders
      if (!document.querySelector('#storybook-root')) {
        document.querySelector('#storybook-body').innerHTML += previewHtml;
      }
    });
  }

  return <div id="storybook-body"></div>;
};
