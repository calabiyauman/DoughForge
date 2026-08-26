# Reference corpus manifest

`manifest.json` indexes a small development benchmark without committing any reference SVG, mesh, project, or image asset. Paths are relative to an external corpus root. Provenance, dimensions, preferred revisions, generation modes, and rights are intentionally marked provisional or unknown where they have not been confirmed.

Validate metadata only:

```sh
npm run validate:references
```

To also verify every referenced file, set `DOUGHFORGE_REFERENCE_ROOT` to the local `cookiecutters` directory before running the command. For example, in PowerShell:

```powershell
$env:DOUGHFORGE_REFERENCE_ROOT = 'D:\private\cookiecutters'
npm run validate:references
```

Keep the assets external and private unless their rights explicitly permit redistribution. Do not add large model files to this repository.

## Held-out selection

All seeded families are development cases. After family grouping, preferred-reference annotation, and rights review, select a mode-balanced held-out set from families not listed here, record it once, and freeze it before tuning generation or scoring. Held-out geometry must not be used for prompts, retrieval, profile calibration, or repair heuristics.
