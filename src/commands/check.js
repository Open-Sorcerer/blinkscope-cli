#!/usr/bin/env node

import chalk from "chalk";
import { exec, spawn } from "child_process";
import ora from "ora";
import fs from "fs";
import path from "path";
import os from "os";
import net from "net";

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

    let lastPort = BASE_PORT;
    if (fs.existsSync(PORT_FILE)) {
      lastPort = parseInt(fs.readFileSync(PORT_FILE, "utf8"));
    }

    let port;
    try {
      port = await getAvailablePort(lastPort);
    } catch (error) {
      console.error(
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
    console.error(chalk.redBright(error));
    process.exit(1);
  }
}

export default async function checker() {
  console.log(chalk.cyan("\nSetting up BlinkScope project..."));
  console.log(chalk.gray(`Using signature: ${BLINKSCOPE_SIGNATURE}`));

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
      console.error(chalk.redBright(error));
    }
  } else {
    await cloneRepository(repo);
  }

  await updateEnvFile();
  await runNpmCommands();
}

// Run the main function
checker().catch((error) => {
  console.error(chalk.red("An error occurred:"));
  console.error(chalk.redBright(error));
  process.exit(1);
});
