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

async function terminateProcessOnPort(port) {
  const command =
    process.platform === "win32"
      ? `netstat -ano | findstr :${port}`
      : `lsof -i :${port} -t`;

  try {
    const output = await execPromise(command);
    const pid =
      process.platform === "win32"
        ? output
            .split("\n")
            .find((line) => line.includes("LISTENING"))
            .split(/\s+/)
            .pop()
        : output.trim();

    if (pid) {
      await execPromise(
        process.platform === "win32"
          ? `taskkill /F /PID ${pid}`
          : `kill -9 ${pid}`
      );
      console.log(chalk.yellow(`Terminated process on port ${port}`));
    }
  } catch (error) {
    // No process found on the port, which is fine
  }
}

async function getAvailablePort(preferredPort) {
  await terminateProcessOnPort(preferredPort);
  if (await isPortAvailable(preferredPort)) {
    return preferredPort;
  }

  for (let port = BASE_PORT; port <= MAX_PORT; port++) {
    await terminateProcessOnPort(port);
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
    throw error;
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
    throw error;
  }
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
      throw error;
    }

    console.log(chalk.blue(`Using port: ${port}`));
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
      await terminateProcessOnPort(port);
      process.exit(0);
    });

    // Keep the main process running
    await new Promise(() => {});
  } catch (error) {
    spinner.fail(chalk.red("Failed to run commands"));
    throw error;
  }
}

export default async function checker(url) {
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
      throw error;
    }
  } else {
    await cloneRepository(repo);
  }

  await updateEnvFile();
  await runNpmCommands(url);
}
