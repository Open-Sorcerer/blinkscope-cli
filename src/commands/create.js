import chalk from "chalk";
import { exec } from "child_process";
import inquirer from "inquirer";
import ora from "ora";
import { getTemplates } from "../templates.js";
import fs from "fs";
import path from "path";

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function cloneRepository(repo, path, projectName) {
  const spinner = ora("Cloning repository...").start();
  try {
    await execPromise(`git clone --no-checkout ${repo} ${projectName}`);
    process.chdir(projectName);
    await execPromise("git config core.sparseCheckout true");
    fs.writeFileSync(".git/info/sparse-checkout", path);
    await execPromise("git checkout main");

    // Move contents from subdirectory to root if path is specified
    if (path) {
      const files = fs.readdirSync(path);
      files.forEach((file) => {
        fs.renameSync(`${path}/${file}`, file);
      });
      // Use fs.rmSync instead of fs.rmdirSync
      fs.rmSync(path, { recursive: true, force: true });
    }

    spinner.succeed(chalk.green("Project created successfully"));
  } catch (error) {
    spinner.fail(chalk.red("Project creation failed"));
    console.error(chalk.redBright(error));
    process.exit(1);
  }
}

export default async function createProject() {
  const templates = getTemplates();

  const frameworkQuestion = [
    {
      message: chalk.blue("Which framework do you want to use?"),
      name: "framework",
      type: "list",
      choices: templates.map((t) => t.name),
    },
  ];

  const { framework } = await inquirer.prompt(frameworkQuestion);

  const projectNameQuestion = [
    {
      message: chalk.yellow("Enter the project name:\t"),
      name: "projectName",
      type: "input",
    },
  ];

  const { projectName } = await inquirer.prompt(projectNameQuestion);

  console.log(
    chalk.cyan("\nCreating Solana Blinks project:"),
    chalk.green(projectName)
  );

  const selectedTemplate = templates.find((t) => t.name === framework);

  if (selectedTemplate) {
    console.log(
      chalk.magentaBright(`\nUsing ${selectedTemplate.name} template`)
    );

    await cloneRepository(
      selectedTemplate.repo,
      selectedTemplate.path,
      projectName
    );

    console.log(chalk.cyan("\n✨ Next steps:"));
    console.log(chalk.white(`1. cd ${projectName}`));
    console.log(chalk.white("2. npm install"));
    console.log(chalk.white("3. npm run dev"));
  } else {
    console.log(chalk.redBright("Template not found"));
  }
}
