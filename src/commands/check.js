#!/usr/bin/env node

import chalk from "chalk";
import { exec, spawn } from "child_process";
import ora from "ora";
import fs from "fs";
import path from "path";
import os from "os";
import net from "net";
import readline from "readline";

const BLINKSCOPE_PATH = path.join(os.homedir(), ".blinkscope");
const REPO_PATH = path.join(BLINKSCOPE_PATH, "blinks-debugger");
const PORT_FILE = path.join(BLINKSCOPE_PATH, "last_port.txt");
const BASE_PORT = 3000;
const MAX_PORT = 3010;
const BLINKSCOPE_SIGNATURE = "BLINKSCOPE_DEBUGGER_INSTANCE";

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

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .once("error", () => {
        resolve(false);
      })
      .once("listening", () => {
        server.close();
        resolve(true);
      })
      .listen(port);
  });
}

async function getAvailablePort(startPort) {
  for (let port = startPort; port <= MAX_PORT; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error("No available ports found");
}

async function cloneRepository(repo) {
  const spinner = ora("Setting up the local environment...").start();
  try {
    await ensureDirectoryExists(BLINKSCOPE_PATH);
    await execPromise(`git clone ${repo} ${REPO_PATH}`);
    spinner.succeed(chalk.green("Repository cloned successfully"));
  } catch (error) {
    spinner.fail(chalk.red("Repository cloning failed"));
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
    console.log(chalk.red("Failed to create .env file"));
  }
}

function askForUrl() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      chalk.yellow("Enter a URL to debug (optional, press Enter to skip): "),
      (url) => {
        rl.close();
        resolve(url.trim());
      }
    );
  });
}

async function runNpmCommands(url) {
  const spinner = ora("Installing dependencies...").start();
  try {
    await execPromise("bun install", { cwd: REPO_PATH });
    spinner.succeed(chalk.green("Dependencies installed successfully"));

    let lastPort = BASE_PORT;
    if (fs.existsSync(PORT_FILE)) {
      lastPort = parseInt(fs.readFileSync(PORT_FILE, "utf8"));
    }

    let port;
    try {
      port = await getAvailablePort(lastPort);
    } catch (error) {
      console.log(
        chalk.red(
          "Failed to find an available port. Please ensure ports 3000-3010 are not in use."
        )
      );
      process.exit(1);
    }

    fs.writeFileSync(PORT_FILE, port.toString());

    spinner.start("Starting the development server...");
    const devProcess = spawn("bun", ["run", "dev", "--port", port.toString()], {
      cwd: REPO_PATH,
      stdio: "pipe",
      env: { ...process.env, [BLINKSCOPE_SIGNATURE]: "true" },
    });

    let serverUrl = null;

    devProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("- Local:")) {
        const match = output.match(/- Local:\s+(http:\/\/localhost:\d+)/);
        if (match) {
          serverUrl = match[1];
          if (url) {
            serverUrl += `/?url=${encodeURIComponent(url)}`;
          }
          spinner.succeed(chalk.green("Development server started"));
          console.log(chalk.cyan("\nYour BlinkScope server is now running!"));
          console.log(
            chalk.cyan("Open your browser and navigate to: ") +
              chalk.green(serverUrl)
          );
          console.log(
            chalk.yellow("\nPress Ctrl+C to stop the server and exit.")
          );
        }
      }
      // Suppress most of the output, only show important messages
      if (output.includes("error") || output.includes("Error")) {
        console.log(chalk.red(output));
      }
    });

    devProcess.stderr.on("data", (data) => {
      // Suppress stderr output
    });

    devProcess.on("close", (code) => {
      if (code !== 0) {
        console.log(
          chalk.red(
            `Development server process exited unexpectedly. Please try again.`
          )
        );
      }
    });

    // Handle process termination
    process.on("SIGINT", async () => {
      console.log(chalk.yellow("\nTerminating the development server..."));
      devProcess.kill();
      process.exit(0);
    });

    // Keep the main process running
    await new Promise(() => {});
  } catch (error) {
    spinner.fail(chalk.red("Failed to run commands"));
    process.exit(1);
  }
}

export default async function checker() {
  console.log(chalk.cyan("\nWelcome to BlinkScope!"));

  const url = await askForUrl();

  console.log(chalk.cyan("\nSetting up BlinkScope project..."));

  const repo = "https://github.com/Open-Sorcerer/blinks-debugger";

  if (fs.existsSync(REPO_PATH)) {
    console.log(
      chalk.yellow("BlinkScope repository already exists. Updating...")
    );
    const spinner = ora("Pulling latest changes...").start();
    try {
      await execPromise("git pull", { cwd: REPO_PATH });
      spinner.succeed(chalk.green("Repository updated successfully"));
    } catch (error) {
      spinner.fail(chalk.red("Failed to update repository"));
    }
  } else {
    await cloneRepository(repo);
  }

  await updateEnvFile();
  await runNpmCommands(url);
}

// Run the main function
console.log(chalk.cyan("Starting BlinkScope..."));
checker().catch((error) => {
  console.log(chalk.red("An unexpected error occurred. Please try again."));
});
