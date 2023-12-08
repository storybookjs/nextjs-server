<h1>Storybook NextJS Server</h1>

Storybook NextJS server is a **highly experimental** framework to build React Server Components in isolation. Unlike the stable `@storybook/nextjs`, it is embedded **inside** your NextJS app and rendered by NextJS.

This has a few key benefits:

1. You only need to start up one server when you’re developing your app
2. It is “lightweight” since your app is doing most of the heavy lifting
3. Your components render identically to how they render in your app
4. You can use it to develop [React Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)

- [Install](#install)
- [Start](#start)
- [Develop](#develop)
  - [Pages directory](#pages-directory)
  - [App directory](#app-directory)
- [Customize](#customize)

## Install

To install, run the following in an existing NextJS project:

```bash
npm create nextjs-storybook
```

Then update your `next.config.js` to use the `withStorybook` decorator.

```diff
+ const withStorybook = require('@storybook/nextjs-server/next-config')(/* sb config */);

/** @type {import('next').NextConfig} */
- module.exports = {/* nextjs config */}
+ module.exports = withStorybook({/* nextjs config */});
```

## Start

The installer adds sample stories to the `/src/stories` or `/stories` directory. To view your Storybook, simply run your NextJS dev server:

```sh
npm run dev
```

Your app should display as normal, but it should get a new route, `/storybook`, that displays your stories.

It can fail if your NextJS dev server is not running on the default port, which is `3000` or the `$PORT` environment variable if set. If the specified port is already taken, NextJS will auto-increment to find a free port and this messes up Storybook in the current configuration. You can [customize](#customize) your setup for different ports, routes, etc. as needed.

## Develop

Developing in Storybook is documented in the [official docs](https://storybook.js.org/docs), but there are some nuances to be aware of in Storybook NextJS Server. The behavior is different depending on whether you are running in NextJS's `pages` setup (old) or `app` directory.

If your app is running in the `pages` directory, Storybook stories are implemented as React Client Components and should behave very similarly to the stable Storybook for NextJS.

If your app is running in the `app` directory, Storybook's stories are running as [React Server Components (RSC)](https://nextjs.org/docs/app/building-your-application/rendering/server-components), are therefore subject to various RSC constraints. 

### Pages directory

FIXME

### App directory

FIXME

## Customize

The `withStorybook` function accepts several configuration options, all of which are optional:

| Option          | Description                                   | Default                  |
| --------------- | --------------------------------------------- | ------------------------ |
| **port**        | Port that the Next.js app will run on.        | process.env.PORT ?? 3000 |
| **sbPort**      | Internal port that Storybook will run on.     | 34567                    |
| **managerPath** | URL path to Storybook's "manager" UI.         | 'storybook'              |
| **previewPath** | URL path to Storybook's story preview iframe. | 'storybook-preview'      |
| **configDir**   | Directory where Storybook's config files are. | '.storybook'             |
| **appDir**      | Whether to use the NextJS app directory.      | undefined                |

