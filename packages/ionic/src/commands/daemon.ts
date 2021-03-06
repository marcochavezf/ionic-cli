import * as chalk from 'chalk';

import {
  Command,
  CommandLineInputs,
  CommandLineOptions,
  CommandMetadata,
  DistTag,
  determineDistTag,
  fsUnlink,
  pkgLatestVersion,
  pluginHasUpdate,
  prettyPath,
  processRunning,
} from '@ionic/cli-utils';

@CommandMetadata({
  name: 'daemon',
  type: 'global',
  description: 'Ionic update checker daemon',
  options: [
    {
      name: 'interval',
      description: 'Interval, in seconds, to check for updates',
      default: '900',
    },
    {
      name: 'kill-existing',
      description: 'If an existing daemon is found, force kill it',
      type: Boolean,
    },
  ],
  visible: false,
})
export class DaemonCommand extends Command {
  async run(inputs: CommandLineInputs, options: CommandLineOptions): Promise<void | number> {
    const updateInterval = Number(options.interval);
    const killExisting = options['kill-existing'];
    const config = await this.env.config.load();

    if (!config.daemon.updates) {
      this.env.log.info('Daemon is disabled.');
      return 1;
    }

    const f = await this.env.daemon.getPid();
    const d = await this.env.daemon.load();

    d.daemonVersion = this.env.plugins.ionic.version;

    if (f) {
      this.env.log.info(`Daemon pid file found: ${chalk.bold(prettyPath(this.env.daemon.pidFilePath))}`);

      if (killExisting) {
        this.env.log.info(`Killing existing daemon process ${chalk.bold(String(f))}.`);
        await fsUnlink(this.env.daemon.pidFilePath);
        process.kill(Number(f));
      } else if (!processRunning(f)) {
        this.env.log.info(`Process ${chalk.bold(String(f))} not found, deleting pid file.`);
        await fsUnlink(this.env.daemon.pidFilePath);
      } else {
        this.env.log.info('Daemon already running and up-to-date.');
        return 0;
      }
    }

    this.env.log.info(`Writing ${chalk.bold(String(process.pid))} to daemon pid file (${chalk.bold(prettyPath(this.env.daemon.pidFilePath))}).`);
    await this.env.daemon.setPid(process.pid);

    const updateFn = async () => {
      const config = await this.env.config.load({ disk: true });
      const f = await this.env.daemon.getPid();
      const d = await this.env.daemon.load({ disk: true });

      const ionicDistTag = determineDistTag(d.daemonVersion);
      const latestDistTagVersion = typeof d.latestVersions[ionicDistTag] === 'undefined' ? d.daemonVersion : d.latestVersions[ionicDistTag].ionic;

      if (!f) {
        this.env.log.info(`Daemon shutting down--pid file missing.`);
        return process.exit();
      } else if (f !== process.pid) {
        this.env.log.info(`Daemon shutting down--mismatch with pid file. (${chalk.bold(String(f))} vs ${chalk.bold(String(process.pid))})`);
        return process.exit();
      } else if (!config.daemon.updates) {
        this.env.log.info(`Daemon shutting down--daemon was disabled.`);
        return process.exit();
      } else if (await pluginHasUpdate(d.daemonVersion, latestDistTagVersion)) {
        this.env.log.info(`Daemon shutting down--out-of-date. (${chalk.bold(d.daemonVersion)} vs ${chalk.bold(latestDistTagVersion)})`);
        return process.exit();
      }

      for (let distTag in d.latestVersions) {
        const pkgs = Object.keys(d.latestVersions[distTag]);
        const pkgUpdates = await Promise.all(pkgs.map(pkg => pkgLatestVersion(this.env, pkg, <DistTag>distTag)));

        for (let i in pkgUpdates) {
          d.latestVersions[distTag][pkgs[i]] = pkgUpdates[i] || '';
        }
      }

      this.env.log.info('Writing daemon file.');
      await this.env.daemon.save();
    };

    const cleanup = () => {
      try {
        const fs = require('fs');
        fs.unlinkSync(this.env.daemon.pidFilePath);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }

      process.exit();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGHUP', cleanup);
    process.on('SIGBREAK', cleanup);

    const delayMs = 5 * 1000; // wait 5 seconds before doing first check
    const updateIntervalMs = updateInterval * 1000; // check every interval

    setTimeout(async () => {
      await updateFn();
      setInterval(updateFn, updateIntervalMs);
    }, delayMs);
  }
}
