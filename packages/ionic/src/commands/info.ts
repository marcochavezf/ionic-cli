import * as chalk from 'chalk';

import {
  Command,
  CommandLineInputs,
  CommandLineOptions,
  CommandMetadata,
  InfoHookItem,
  columnar,
  strcmp,
} from '@ionic/cli-utils';

@CommandMetadata({
  name: 'info',
  type: 'global',
  description: 'Print system/environment info'
})
export class InfoCommand extends Command {
  async run(inputs: CommandLineInputs, options: CommandLineOptions): Promise<void> {
    const task = this.env.tasks.next('Gathering environment info');

    const initialValue: InfoHookItem[] = [];
    const results = await this.env.hooks.fire('command:info', { cmd: this, env: this.env, inputs, options });
    const flattenedResults = results.reduce((acc, currentValue) => acc.concat(currentValue), initialValue);

    const cliDetails = flattenedResults.filter((item) => item.type === 'cli-packages');
    const globalNpmDetails = flattenedResults.filter((item) => item.type === 'global-packages' || <string>item.type === 'global-npm'); // TODO: take out global-npm
    const localNpmDetails = flattenedResults.filter((item) => item.type === 'local-packages' || <string>item.type === 'local-npm'); // TODO: take out local-npm
    const systemDetails = flattenedResults.filter((item) => item.type === 'system');

    const splitInfo = (ary: InfoHookItem[]) => ary
      .sort((a, b) => strcmp(a.name, b.name))
      .map((item): [string, string] => [item.name, chalk.dim(item.version) + (item.path ? ` ${chalk.dim('(' + item.path + ')')}` : '')]);

    const format = (details: [string, string][]) => columnar(details, { vsep: ':' }).split('\n').join('\n    ');

    task.end();

    if (!this.env.project.directory) {
      this.env.log.warn('You are not in an Ionic project directory. Project context may be missing.');
    }

    if (cliDetails.length > 0) {
      this.env.log.msg('\n' + chalk.bold('cli packages:'));
      this.env.log.msg(`\n    ${format(splitInfo(cliDetails))}`);
    }

    if (globalNpmDetails.length > 0) {
      this.env.log.msg('\n' + chalk.bold('global packages:'));
      this.env.log.msg(`\n    ${format(splitInfo(globalNpmDetails))}`);
    }

    if (localNpmDetails.length > 0) {
      this.env.log.msg('\n' + chalk.bold('local packages:'));
      this.env.log.msg(`\n    ${format(splitInfo(localNpmDetails))}`);
    }

    if (systemDetails.length > 0) {
      this.env.log.msg('\n' + chalk.bold('System:'));
      this.env.log.msg(`\n    ${format(splitInfo(systemDetails))}`);
    }

    this.env.log.nl();
  }
}
