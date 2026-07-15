# @logistics-ts/classification

## 0.1.1

### Patch Changes

- f31ccac: Add a dedicated `README.md` to every published package. `npm publish` reads
  `README.md` from each package's own directory, not the repo root — since none
  of the five packages had one, every npm page showed no README at all (just
  the one-line description). Each package now ships an npm-facing README with
  badges, an install snippet, a runnable quick-start example, and links back to
  the monorepo docs.

  Also tightened the `logistics-ts` package description to lead with the
  `Explained<T>` differentiator instead of a generic "toolkit" framing.

- Updated dependencies [f31ccac]
  - @logistics-ts/core@0.1.1

## 0.1.0

### Patch Changes

- @logistics-ts/core@0.1.0
