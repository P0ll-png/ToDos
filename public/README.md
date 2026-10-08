# public/ — static assets

Files here are served from the site root as-is (Vite copies `public/` into the
build output verbatim). A file placed at `public/logo.png` is reachable at
`/logo.png` in the app and in the deployed site.

## Logo

The header's circular logo holder loads `/logo.png`. To use your own logo:

1. Drop your image in this folder named **`logo.png`**
   (`c:\Users\paulc\Projects\ToDoS\public\logo.png`).
2. That's it — no import or code change needed. Commit and push; Vercel serves it.

Notes:
- A square image works best (the holder is a circle and crops to fit).
- Other formats work too — if you use `logo.svg` or `logo.jpg`, update the
  `src="/logo.png"` in `src/components/Header.tsx` to match the file name.
- Until the file exists, the header falls back to a built-in SVG mark, so the
  app never shows a broken image.
