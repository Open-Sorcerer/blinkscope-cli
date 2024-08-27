import chalk from "chalk";
import { exec, spawn } from "child_process";
import ora from "ora";
import fs from "fs";
import path from "path";
import os from "os";

const BLINKSCOPE_PATH = path.join(os.homedir(), ".blinkscope");
const REPO_PATH = path.join(BLINKSCOPE_PATH, "blinks-debugger");

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

async function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function cloneRepository(repo) {
  const spinner = ora("Setting up the local environment...").start();
  try {
    await ensureDirectoryExists(BLINKSCOPE_PATH);
    await execPromise(`git clone ${repo} ${REPO_PATH}`);
    spinner.succeed(chalk.green("Repository cloned successfully"));
  } catch (error) {
    spinner.fail(chalk.red("Repository cloning failed"));
    console.error(chalk.redBright(error));
    process.exit(1);
  }
}

async function updateEnvFile() {
  const envPath = path.join(REPO_PATH, ".env");
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
    await execPromise("bun install", { cwd: REPO_PATH });
    spinner.succeed(chalk.green("Dependencies installed successfully"));

    spinner.start("Starting the development server...");
    const devProcess = spawn("bun", ["run", "dev"], {
      cwd: REPO_PATH,
      stdio: "pipe",
    });

    devProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("ready")) {
        spinner.succeed(chalk.green("Development server started"));
        console.log(chalk.cyan("\nYour BlinkScope server is now running!"));
        console.log(
          chalk.cyan("Open your browser and navigate to: ") +
            chalk.green("http://localhost:3000")
        );
        console.log(
          chalk.yellow("\nPress Ctrl+C to stop the server and exit.")
        );
      }
      process.stdout.write(output);
    });

    devProcess.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    devProcess.on("close", (code) => {
      if (code !== 0) {
        console.log(
          chalk.red(`Development server process exited with code ${code}`)
        );
      }
    });

    // Keep the main process running
    await new Promise(() => {});
  } catch (error) {
    spinner.fail(chalk.red("Failed to run commands"));
    console.error(chalk.redBright(error));
    process.exit(1);
  }
}

export default async function checker() {
  console.log(chalk.cyan("\nSetting up BlinkScope project..."));

  const repo = "https://github.com/Open-Sorcerer/blinks-debugger";

  if (fs.existsSync(REPO_PATH)) {
    console.log(
      chalk.yellow("BlinkScope repository already exists. Updating...")
    );
    const spinner = ora("Pulling latest changes...").start();
    try {
      await execPromise("git pull", { cwd: REPO_PATH });

      // show the last commit
      const lastCommit = await execPromise("git log -1 --pretty=%B", {
        cwd: REPO_PATH,
      });
      console.log(
        chalk.cyan(
          `\nLast commit: ${lastCommit
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .join("\n")}`
        )
      );

      spinner.succeed(chalk.green("Repository updated successfully"));
    } catch (error) {
      spinner.fail(chalk.red("Failed to update repository"));
      console.error(chalk.redBright(error));
    }
  } else {
    await cloneRepository(repo);
  }

  await updateEnvFile();
  await runNpmCommands();

  // The following lines won't be reached as the script will keep running with the dev server
  console.log(chalk.cyan("\nBlinkScope project is now set up and running!"));
  console.log(chalk.cyan("Happy debugging with BlinkScope! 🔍✨"));
  console.log(
    chalk.yellow(
      "\nNote: A default Solana RPC URL (https://api.mainnet-beta.solana.com) has been set in the .env file."
    )
  );
  console.log(
    chalk.yellow(
      `If you need to use a different RPC URL, please update it in ${path.join(
        REPO_PATH,
        ".env"
      )}`
    )
  );
  console.log(
    chalk.cyan(`\nYou can find the BlinkScope project at: ${REPO_PATH}`)
  );
}
