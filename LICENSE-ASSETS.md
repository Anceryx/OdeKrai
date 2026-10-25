# Asset Licensing and Distribution

The code and application dependencies have their own license terms. They do not grant permission to redistribute visual materials supplied by the owner.

The `odekrai-head.glb` model and visual references in `assets/odekrai/` are private materials owned by the project owner. Do not include them in installers, releases, public screenshots, or other distributed artifacts without explicit authorization. These files remain outside Git.

`npm run build` is a local frontend build and may copy the model to `dist/assets/`. To prepare the distributable application, run `npm run tauri:build`: its `beforeBuildCommand` runs `check:release-assets` and blocks packaging if it finds `odekrai-head*.glb` or files inside `official-references/`. It also runs `check:debug-command`, which requires `cfg(debug_assertions)` in both the declaration and registration of the manual simulated tool. These checks inspect files under `dist/` without opening or printing asset contents.

If a check blocks the build, do not remove the guard or publish the artifact. Prepare a build without those materials and run the check again. Confirm their absence from the artifact before distribution.
