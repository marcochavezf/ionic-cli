import * as path from 'path';

import * as chalk from 'chalk';

import {
  BACKEND_PRO,
  CommandLineInputs,
  CommandLineOptions,
  CommandMetadata,
  CommandPreRun,
  fsMkdirp,
  pathExists,
  prettyPath,
} from '@ionic/cli-utils';

import { SSHBaseCommand } from './base';

@CommandMetadata({
  name: 'generate',
  type: 'global',
  backends: [BACKEND_PRO],
  description: 'Generates a private and public SSH key pair',
  inputs: [
    {
      name: 'key-path',
      description: 'Destination of private key file',
      required: false,
    },
  ],
  options: [
    {
      name: 'bits',
      description: 'Number of bits in the key',
      aliases: ['b'],
      default: '2048',
    },
    {
      name: 'annotation',
      description: 'Annotation (comment) in public key. Your Ionic email address will be used',
      aliases: ['C'],
    }
  ],
})
export class SSHGenerateCommand extends SSHBaseCommand implements CommandPreRun {
  async preRun(inputs: CommandLineInputs, options: CommandLineOptions): Promise<void | number> {
    await this.checkForOpenSSH();

    const config = await this.env.config.load();
    await this.env.session.getUserToken();

    if (!options['annotation']) {
      options['annotation'] = config.user.email;
    }
  }

  async run(inputs: CommandLineInputs, options: CommandLineOptions): Promise<void | number> {
    const { getGeneratedPrivateKeyPath } = await import('../../lib/ssh');

    const { bits, annotation } = options;

    const keyPath = inputs[0] ? path.resolve(String(inputs[0])) : await getGeneratedPrivateKeyPath(this.env);
    const keyPathDir = path.dirname(keyPath);
    const pubkeyPath = `${keyPath}.pub`;

    if (!(await pathExists(keyPathDir))) {
      await fsMkdirp(keyPathDir, 0o700);
      this.env.log.info(`Created ${chalk.bold(prettyPath(keyPathDir))} directory for you.\n`);
    }

    this.env.log.info(
      `You will be prompted to provide a ${chalk.bold('passphrase')}, which is ` +
      'used to protect your private key should you lose it. (If someone has your ' +
      'private key, they can impersonate you!) Passphrases are recommended, but not required.'
    );

    this.env.close();
    await this.env.shell.run('ssh-keygen', ['-q', '-t', 'rsa', '-b', String(bits), '-C', String(annotation), '-f', keyPath], { stdio: 'inherit', showError: false });
    this.env.open();

    this.env.log.ok(
      'A new pair of SSH keys has been generated!\n' +
      `Private Key (${chalk.bold(prettyPath(keyPath))}): Keep this safe!\n` +
      `Public Key (${chalk.bold(prettyPath(pubkeyPath))}): Give this to all your friends!`
    );

    this.env.log.info(
      'Next steps:\n' +
      `- Add your public key to Ionic: ${chalk.green('ionic ssh add ' + prettyPath(pubkeyPath))}\n` +
      `- Use your private key for secure communication with Ionic: ${chalk.green('ionic ssh use ' + prettyPath(keyPath))}`
    );
  }
}
