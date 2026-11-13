# Traffic simulation repository structure

`CLAUDE.md` is the coding agent’s entry point. The project brief, design, workflow, and 3D setup documents live in `docs/agents/`. Resolve the paths in this guide from the repository root.

## Repository layout

```text
traffic-sim/
├── CLAUDE.md
├── README.md
├── docs/
│   └── agents/
│       ├── 3D_SETUP.md
│       ├── 3d-project.json
│       ├── design.md
│       ├── REPO_STRUCTURE.md
│       ├── START_HERE.md
│       └── WORKFLOW.md
├── assets/
│   └── 3d/
│       ├── incoming/
│       │   ├── kenney_car-kit.zip
│       │   ├── kenney_city-kit-roads.zip
│       │   └── kenney_road-textures.zip
│       ├── source/
│       │   ├── kenney_car-kit/         # Planned extraction folder
│       │   ├── kenney_city-kit-roads/  # Planned extraction folder
│       │   └── kenney_road-textures/   # Planned extraction folder
│       └── ASSETS.md                 # Planned asset inventory and licenses
├── package.json                      # Planned app dependencies and commands
├── [package-manager lockfile]         # Planned, name depends on toolchain
├── src/                              # Planned application source
│   ├── app/                          # App entry point and workspace
│   ├── components/                   # Scene picker, parts drawer, inspector, results
│   ├── scenes/                       # Starter maps and saved-scene loading
│   ├── editor/                       # Placement preview, snapping, validation, undo
│   ├── simulation/                   # Lane network, routing, vehicles, controls, timing
│   ├── three/
│   │   ├── scene/                    # Rendering, lighting, scene lifecycle
│   │   ├── loaders/                  # Browser asset loading, shared kit textures
│   │   ├── controls/                 # Observer camera and viewport input
│   │   ├── render/                   # Drawing on demand, adaptive resolution
│   │   └── thumbnails/               # Part pictures for the parts tray
│   └── styles/                       # Visual tokens and interface styles
├── public/                           # Planned, subject to toolchain conventions
│   ├── models/                       # Browser-ready models used by the app (roads, vehicles, nature)
│   └── textures/                     # Not used: City Kit pieces carry their own colormap.png beside the models
└── artifacts/                        # Planned verification output
    ├── 3d/
    │   └── previews/                 # Browser verification screenshots
    └── perf/                         # Benchmark results (npm run perf; git-ignored)
```

Adapt app entry points, test locations, and static asset paths to the selected toolchain. Create planned folders when they have content.

Keep traffic rules in the simulation module so route, signal, and timer behavior can be tested independently of Three.js rendering. Use the same placement rules for the translucent preview and the final drop. Use road connection points to update the lane network when a piece is placed. Give starter maps and saved scenes a shared format so both can open in the same editor.

## Asset intake and browser delivery

1. Use the ZIPs under `assets/3d/incoming/` (the three original Kenney packs, and the Nature Kit the owner added for scenery on 2026-11-13). Keep their original filenames. Inspect entries and sizes before extraction and check `assets/3d/source/` for existing copies. Extract each pack into its own source folder.
2. Create `assets/3d/ASSETS.md`. Record useful models and textures, observed formats, dependencies, sizes, known units, and available licensing. Record where the browser-ready versions are stored.
3. Verify one supplied vehicle and a short road section with a supplied texture in Three.js. Follow `docs/agents/3D_SETUP.md` for scale, orientation, connection points, and browser checks.
4. If the toolchain serves `public/`, put runtime models in `public/models/` and shared textures in `public/textures/`. Keep model-relative dependencies with their models. Verify served URLs under the deployed app’s base path.
5. Update `docs/agents/3d-project.json` with actual paths, asset conventions, and verified commands. Keep archives, unused sources, and verification screenshots outside the deployed site. Choose version-control storage after inspecting asset sizes.

## File responsibilities

| File | What belongs there |
| --- | --- |
| `CLAUDE.md` | Agent entry instructions and pointers to `docs/agents/` |
| `README.md` | Project overview and verified commands for running the app |
| `docs/agents/START_HERE.md` | Owner’s brief, one-session build scope, and delivery goals |
| `docs/agents/design.md` | Player experience, visual tokens, maps, editing, camera, and acceptance criteria |
| `docs/agents/3D_SETUP.md` | Asset preparation, road-piece conventions, and browser verification |
| `docs/agents/3d-project.json` | Toolchain, asset paths, coordinate conventions, and verified commands |
| `docs/agents/WORKFLOW.md` | Planning, tickets, TDD, review, commit, PR, and merge formats |
| `docs/agents/REPO_STRUCTURE.md` | Repository layout and asset placement |