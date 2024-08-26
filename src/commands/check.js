import chalk from "chalk";
import { exec } from "child_process";
import ora from "ora";
import fs from "fs";
import path from "path";

function execPromise(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function cloneRepository(repo) {
  const spinner = ora("Cloning repository...").start();
  try {
    await execPromise(`git clone ${repo} blinkscope-project`);
    spinner.succeed(chalk.green("Repository cloned successfully"));
  } catch (error) {
    spinner.fail(chalk.red("Repository cloning failed"));
    console.error(chalk.redBright(error));
    process.exit(1);
  }
}

async function updateEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  const envContent = `NEXT_PUBLIC_RPC=https://api.mainnet-beta.solana.com\n`;

  try {
    fs.writeFileSync(envPath, envContent);
    console.log(chalk.green("Created .env file with default Solana RPC URL"));
  } catch (error) {
    console.error(chalk.red("Failed to create .env file"));
    console.error(chalk.redBright(error));
  }
}

async function runNpmCommands() {
  const spinner = ora("Installing dependencies...").start();
  try {
    await execPromise("npm install", { cwd: process.cwd() });
    spinner.succeed(chalk.green("Dependencies installed successfully"));

    spinner.start("Starting the development server...");
    await execPromise("npm run dev", { cwd: process.cwd() });
  } catch (error) {
    spinner.fail(chalk.red("Failed to run npm commands"));
    console.error(chalk.redBright(error));
    process.exit(1);
  }
}

export default async function checker() {
  console.log(chalk.cyan("\nCreating BlinkScope project..."));

  const repo = "https://github.com/Open-Sorcerer/blinks-debugger";
  await cloneRepository(repo);

  process.chdir("blinkscope-project");

  await updateEnvFile();

  await runNpmCommands();

  console.log(chalk.cyan("\nBlinkScope project is now set up and running!"));
  console.log(chalk.cyan("Happy debugging with BlinkScope! 🔍✨"));
  console.log(
    chalk.yellow(
      "\nNote: A default Solana RPC URL (https://api.devnet.solana.com) has been set in the .env file."
    )
  );
  console.log(
    chalk.yellow(
      "If you need to use a different RPC URL, please update it in the .env file."
    )
  );
}
