// TypeScript 7 (native) has no JS compiler API. Tools that need it get TypeScript 6 instead,
// installed under the name `typescript` only for them. The project's own `tsc` stays on 7.x.
const NEEDS_TS_API = new Set(['openapi-typescript'])

function readPackage(pkg) {
  if (NEEDS_TS_API.has(pkg.name)) {
    if (pkg.peerDependencies) delete pkg.peerDependencies.typescript
    pkg.dependencies = { ...pkg.dependencies, typescript: 'npm:@typescript/typescript6@6.0.2' }
  }
  return pkg
}

module.exports = { hooks: { readPackage } }
