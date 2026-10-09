#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { fileURLToPath } from 'url';
import { installer } from './lib/installer.js';
import { getPrompts } from './lib/prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('create-mian-ai')
  .description('Create a new Mian AI project with your choice of sandbox provider')
  .version('1.0.0')
  .option('-s, --sandbox <provider>', 'Sandbox provider (e2b or vercel)')
  .option('-n, --name <name>', 'Project name')
  .option('-p, --path <path>', 'Installation path (defaults to current directory)')
  .option('--skip-install', 'Skip npm install')
  .option('--dry-run', 'Run without making changes')
  .parse(process.argv);

const options = program.opts();

async function main() {
  console.log(chalk.cyan('\n🚀 Welcome to Mian AI Setup!\n'));

  let config = {
    sandbox: options.sandbox,
    name: options.name || 'my-mian-ai',
    path: options.path || process.cwd(),
    skipInstall: options.skipInstall || false,
    dryRun: options.dryRun || false
  };

  // Interactive mode if sandbox not specified
  if (!config.sandbox) {
    const prompts = getPrompts(config);
    const answers = await inquirer.prompt(prompts);
    config = { ...config, ...answers };
  }

  // Validate sandbox provider
  if (!['e2b', 'vercel'].includes(config.sandbox)) {
    console.error(chalk.red(`\n❌ Invalid sandbox provider: ${config.sandbox}`));
    console.log(chalk.yellow('Valid options: e2b, vercel\n'));
    process.exit(1);
  }

  console.log(chalk.gray('\nConfiguration:'));
  console.log(chalk.gray(`  Project: ${config.name}`));
  console.log(chalk.gray(`  Sandbox: ${config.sandbox}`));
  console.log(chalk.gray(`  Path: ${path.resolve(config.path, config.name)}\n`));

  if (config.dryRun) {
    console.log(chalk.yellow('🔍 Dry run mode - no files will be created\n'));
  }

  const spinner = ora('Creating project...').start();

  try {
    await installer({
      ...config,
      templatesDir: path.join(__dirname, 'templates')
    });

    spinner.succeed('Project created successfully!');

    console.log(chalk.green('\n✅ Setup complete!\n'));
    console.log(chalk.white('Next steps:'));
    console.log(chalk.gray(`  1. cd ${config.name}`));
    console.log(chalk.gray(`  2. Copy .env.example to .env and add your API keys`));
    console.log(chalk.gray(`  3. npm run dev`));
    console.log(chalk.gray('\nHappy coding! 🎉\n'));

  } catch (error) {
    spinner.fail('Setup failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
});