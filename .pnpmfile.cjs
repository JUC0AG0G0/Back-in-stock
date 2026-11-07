// pnpm hook, run when dependencies are resolved.
// i18next declares TypeScript as an optional peer dependency (for its types only). pnpm then links
// the workspace's TypeScript to it, which put 24 MB of compiler in the production Docker image.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'i18next' && pkg.peerDependencies) {
        delete pkg.peerDependencies.typescript;
        if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
      }
      return pkg;
    },
  },
};
