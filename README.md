# M LOVE Memorial (PWA)

Memorial inbox + calendar web app built with React + Vite + PWA.

Current behavior:
- Locked emails stay hidden until unlock time.
- Newly unlocked emails appear automatically.
- Local notification is sent when unlocked (if permission is granted and app is active).

## Why HTML looked blank

Do not open the project root `index.html` by double click.
That file is a development entry and must run through Vite.

If GitHub Pages shows a blank page, it is usually because the source files
were served directly instead of the built output.
This repo publishes the prebuilt static files from `docs/`.

GitHub Pages setting should be:
- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/` (root)

If source stays at root, the root page automatically redirects to `/docs/`.

## Quick start (Windows)

- Double click `start-dev.bat`
- Browser opens at `http://localhost:5173`

## Preview production build (Windows)

- Double click `start-preview.bat`
- Browser opens at `http://localhost:4173`

## Manual commands

```bash
npm install
npm run dev -- --host
```

Build + preview:

```bash
npm run build
npm run preview -- --host --port 4173
```

## Project data folders

- `data/calendar/YYYY/*.json`
- `data/emails/YYYY/*.eml`
- `public/chibi/*` (transparent character assets)
- `public/photos/<album-id>/*.webp` (album images)
- `public/data/albums.json` (album list metadata)

Those files are seeded into IndexedDB on first launch.

## Optional: auto build on GitHub (main branch)

If you add workflow file `.github/workflows/auto-build-docs.yml`,
every push to `main` can auto-build `docs/`.
That lets you upload new `EML` / `chibi` / album files in GitHub
without running local build commands.

## Add a new album

1. Put images in `public/photos/<album-id>/` (recommended `.webp`).
2. Add one entry in `public/data/albums.json`:

```json
{
  "id": "your-album-id",
  "title": "標題",
  "subtitle": "副標題",
  "accent": "linear-gradient(135deg, #3d4d88, #1d2548)"
}
```

`id` must match the folder name under `public/photos/`.
