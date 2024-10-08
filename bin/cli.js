#!/usr/bin/env node

import chalk from "chalk";
import figlet from "figlet";
import gradient from "gradient-string";
import ora from "ora";
import checker from "../src/commands/check.js";

console.clear();

const title = figlet.textSync("BlinkScope", {
  font: "ANSI Shadow",
  horizontalLayout: "full",
});

console.log(gradient.pastel.multiline(title));

console.log(
  chalk.cyan("\n🔍 BlinkScope CLI - Your friendly local Solana Blinks debugger")
);

console.log(chalk.dim("\n------------------------------------------------"));

// Get URL from command-line argument
const url = process.argv[2];

if (url) {
  console.log(chalk.yellow(`Debug URL: ${url}`));
} else {
  console.log(chalk.yellow("No debug URL provided. Running in default mode."));
}

const spinner = ora({
  text: chalk.yellow("Initializing BlinkScope..."),
  color: "yellow",
}).start();

try {
  await checker(url);
  spinner.succeed(chalk.green("BlinkScope initialized successfully!"));
} catch (error) {
  spinner.fail(chalk.red("Failed to initialize BlinkScope"));
  console.error(chalk.red("Error:"), error.message);
  console.log(
    chalk.yellow(
      "Please try running the command again. If the problem persists, you may need to manually delete the ~/.blinkscope directory and try again."
    )
  );
  process.exit(1);
}

console.log(chalk.dim("\n------------------------------------------------"));

console.log(chalk.cyan("\n✨ For more information, visit:"));
console.log(
  chalk.blue.underline("https://github.com/Open-Sorcerer/blinks-debugger")
);

console.log(chalk.green("\n🎉 Happy debugging with BlinkScope! 🎉"));
