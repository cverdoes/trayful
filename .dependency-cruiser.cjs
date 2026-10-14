/**
 * Architecture rules for the monorepo, checked by `pnpm lint:deps`.
 * Layers, lowest first: formats, core, then server and app, then cli.
 * A package may import only from layers below it.
 */
const pkg = (name) => `^packages/${name}/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports make modules impossible to understand or test on their own.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'formats-is-the-base',
      severity: 'error',
      comment: 'formats is the file format layer and depends on no other workspace package.',
      from: { path: pkg('formats') },
      to: { path: '^packages/(core|server|app|cli)/' },
    },
    {
      name: 'core-depends-only-on-formats',
      severity: 'error',
      comment: 'core is the pure engine; it must not know about the server, the UI or the CLI.',
      from: { path: pkg('core') },
      to: { path: '^packages/(server|app|cli)/' },
    },
    {
      name: 'server-and-app-are-independent',
      severity: 'error',
      comment: 'The server and the browser app talk over the wire, never through imports.',
      from: { path: '^packages/(server|app)/' },
      to: { path: '^packages/(server|app|cli)/', pathNot: '^packages/$1/' },
    },
    {
      name: 'core-and-app-stay-off-node',
      severity: 'error',
      comment: 'core runs in the browser too, and app is browser-only: no Node built-ins.',
      from: { path: '^packages/(core|app)/src/', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'browser-entry-stays-off-node',
      severity: 'error',
      comment: "formats' browser entry must not pull in the Node-only file loading code.",
      from: { path: '^packages/formats/src/browser\\.ts$' },
      to: { path: '^packages/formats/src/(load|source)\\.ts$', reachable: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'A source file nothing imports is dead code (knip also reports these).',
      from: {
        orphan: true,
        path: '^packages/[^/]+/src/',
        pathNot: ['\\.test\\.ts$', '\\.d\\.ts$', '/src/(index|main|browser)\\.tsx?$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|schema)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.js'],
    },
  },
};
