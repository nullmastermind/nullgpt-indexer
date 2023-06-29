const readline = require("readline");

// Create a readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Prompt the user to press any key
console.log("Press any key to exit...");

// Listen for the 'keypress' event
process.stdin.on("keypress", () => {
  // Close the readline interface
  rl.close();
});

// Start listening for keypress events
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

// Handle the 'close' event
rl.on("close", () => {
  console.log("Exiting...");
  process.exit(0);
});
