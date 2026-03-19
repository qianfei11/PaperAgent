const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const executableName = context.packager.executableName;
  const launcherPath = path.join(context.appOutDir, executableName);
  const binaryPath = path.join(context.appOutDir, `${executableName}-bin`);

  if (!fs.existsSync(launcherPath) || fs.existsSync(binaryPath)) {
    return;
  }

  fs.renameSync(launcherPath, binaryPath);
  fs.writeFileSync(launcherPath, `#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/${executableName}-bin" --no-sandbox "$@"
`, 'utf8');
  fs.chmodSync(launcherPath, 0o755);
};
