# Third-party notices

## three.js (r169) — MIT License
`public/vendor/three.bundle.js` is a single-file esbuild bundle of [three.js](https://github.com/mrdoob/three.js) 0.169.0
and the addons it uses (OrbitControls, CSS2DRenderer, EffectComposer, RenderPass, UnrealBloomPass, OutputPass,
RoomEnvironment, RoundedBoxGeometry).

Copyright © 2010-2024 three.js authors. Licensed under the MIT License:
https://github.com/mrdoob/three.js/blob/dev/LICENSE

To rebuild the bundle:

```bash
npm i three@0.169.0 esbuild
npx esbuild scripts/vendor-entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=public/vendor/three.bundle.js
```

## Fonts (loaded at runtime from Google Fonts, not bundled)
Chakra Petch, Be Vietnam Pro, JetBrains Mono — SIL Open Font License 1.1.
