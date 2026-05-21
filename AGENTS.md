# Repository Guidelines

## React File Organization

- Put each React component in its own file. Do not define multiple exported components in a single component file.
- Put each React hook in its own file. Hook files should focus on the hook and its direct React-specific wiring.
- Do not keep general-purpose utilities inside React component or hook files. Move pure helpers, formatters, data transforms, constants, and other reusable non-React logic into dedicated utility files.
- Prefer colocated utility files when the helper is feature-specific, and shared utility modules when the helper is reused across features.
