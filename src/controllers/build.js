
const os = require('os');
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const crypto = require('crypto');
const uuid = require('uuid');

const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const { minify: minifyHTML } = require("html-minifier-terser");
const JavaScriptObfuscator = require("javascript-obfuscator");
const glob = require("glob");

const packageJson = require("./package.json");
const { create } = require("domain");
const dbConfigPath = "./dbconfig.js";
let originalDbConfig = "";
const dotenv = require('dotenv');

// Function to dynamically import ora for spinner
async function loadOra() {
  const { default: ora } = await import("ora");
  return ora;
}

// Database options (these should match the databases in your dbconfig.js)
const databases = [
  {
    name: "TestDB",
    host: "165.22.97.154",
    database: "testdb",
    user: "user",
    password: "123",
  },
  {
    name: "ReportDB",
    host: "165.22.97.154",
    database: "reportdb",
    user: "user",
    password: "123",
  },
  {
    name: "Colombo",
    host: "137.184.212.33",
    database: "cmisdb",
    user: "cmisdb_dev",
    password: `c^m*isdb_d^e*v`,
  },
  {
    name: "Galle",
    host: "157.230.253.225",
    database: "cmisdb",
    user: "galle_user",
    password: "g@1alle@2",
  },
  {
    name: "Sanasa Federation",
    host: "128.199.250.152",
    database: "sanasa_federation_cmisdb",
    user: "nika_user",
    password: "n@1ika@2",
  },
  {
    name: "Nikaweratiya New",
    host: "157.230.2.109",
    database: "aibanker_nikwaratiya",
    user: "cmisdb_dev_nikawaratiya",
    password: `p^l*i(cd_s%j8l+cn:8;xN~#^<SqJU~EAy75FM_Nr)=*v`,
  },
  {
    name: "lcb_plc_coop_society",
    host: "128.199.250.152",
    database: "lcb_plc_coop_society",
    user: "cmisdb_dev_lcb",
    password: "p^l*i(cd_s%j8l+c^ZbrT!Bf#Wj$Gb$_d^e*v",
  },
  {
    name: "safe_foundation",
    host: "128.199.250.152",
    database: "safe_foundation",
    user: "cmisdb_dev_safe",
    password: "p^l*i(cd_s%j8l+c^ZbrT#u&8FGk(-O$_d^e*v",
  },
  {
    name: "ai_banker(multi - Banks)",
    host: "128.199.250.152",
    database: "ai_banker",
    user: "ai_banker_dev",
    password: `%9jys%j8l+cn:8;xN~#^<SqJU~EAy75FM_Nr)=*v`,
  },
  {
    name: "pannipitiya_sanasa",
    host: "128.199.250.152",
    database: "pannipitiya_sanasa",
    user: "pannipitiya_sanasa_dev",
    password: `%9jy#s%_8l~#^<SqJU~EA(75FM_Nr)=*+cn:8;xNv`,
  },
  {
    name: "Hawana",
    host: "128.199.250.152",
    database: "hawana_cmisdb",
    user: "nika_user",
    password: "n@1ika@2",
  },
  {
    name: "Katagamuwa",
    host: "128.199.250.152",
    database: "katagamuwa_aibanker",
    user: "katagamuwa_aibanker_dev",
    password: `%%_8l~9jy#FM_Nr)Nvs#^<SqJU~EA(=*+cn:8;x75`,
  },
];

dotenv.config();

/**
 * Asynchronously prompts the user for input using inquirer.
 *
 * Prompts the user to enter a new version and select a database configuration.
 * The version input is filtered to ensure it starts with 'v' if not already.
 * The selected database configuration determines the product name.
 *
 * @returns {Object} An object containing the user's answers and the product name based on the selected database.
 */
async function promptUser() {
  const version = process.env.VERSION || 'default_version';
  const databaseName = process.env.DATABASE_NAME || 'default_database';
  const client = process.env.CLIENT || 'default_client';

  // Assign product name based on selected database
  let productName = "AiBanker Bank";
  productName += ` ${databaseName}`;

  return { version, database: databaseName, productName, client };
}

/**
 * Updates the database configuration in dbconfig.js based on the selected database.
 *
 * @param {string} selectedDatabase - The name of the selected database to update the configuration for.
 */
function updateDbConfig(selectedDatabase) {
  const dbConfig = databases.find((db) => db.name === selectedDatabase);

  // Update the poolConfig object in dbconfig.js
  const newConfig = `
    const mariadb = require("mariadb");

    const poolConfig = {
      host: "${dbConfig.host}",
      serverName: "${dbConfig.name}",
      user: "${dbConfig.user}",
      password: "${dbConfig.password}",
      database: "${dbConfig.database}",
      checkDuplicate: false
    };

    let pool;

    async function createPool() {
      if (!pool) {
        pool = await mariadb.createPool(poolConfig);
        console.log(\`Connected to MariaDB pool! in \${poolConfig.serverName} to \${poolConfig.database}\`);
      }
    }

    async function getConnection() {
      if (!pool) {
        await createPool();
      }
      return pool.getConnection();
    }

    async function releaseConnection(connection) {
      if (connection) {
        connection.release();
      }
    }

    module.exports = {
      getConnection,
      releaseConnection
    };
  `;

  // Save the original dbconfig.js content before modifying
  if (!originalDbConfig) {
    originalDbConfig = fs.readFileSync(dbConfigPath, "utf8");
  }
  // Write new config to dbconfig.js
  fs.writeFileSync(dbConfigPath, newConfig, "utf8");
  console.log(`Updated dbconfig.js for ${selectedDatabase}`);
}

// Function to restore original dbconfig.js
function restoreDbConfig() {
  if (originalDbConfig) {
    fs.writeFileSync(dbConfigPath, originalDbConfig, "utf8");
    console.log("Restored original dbconfig.js");
  }
}

// Function to copy files or directories
function copyFileOrDir(source, destination) {
  const stats = fs.statSync(source);

  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    console.log(`Created directory ${destination}`);
  } else if (stats.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    console.log(`Copied ${source} -> ${destination}`);
  }
}

// Function to minify and copy files
async function minifyAndCopyFiles() {
  return new Promise((resolve, reject) => {
    glob("src/**/*", (err, files) => {
      if (err) return reject(new Error(err));

      files.forEach((file) => {
        const outputFile = path.join("release", path.relative("src", file));
        const fileExtension = path.extname(file);

        try {
          if (fileExtension === ".js") {
            const code = fs.readFileSync(file, "utf8");
            const minifiedResult = UglifyJS.minify(code);
            if (minifiedResult.error) {
              console.error(`Error minifying ${file}:`, minifiedResult.error);
            } else {
              const obfuscatedResult = JavaScriptObfuscator.obfuscate(
                minifiedResult.code,
                {
                  compact: true,
                  controlFlowFlattening: true,
                  controlFlowFlatteningThreshold: 0.75, // Adjust for less aggressive flattening
                  disableConsoleOutput: false, // To prevent `console` hijacking
                  transformObjectKeys: false, // Reduce risk of breaking object key dependencies
                  stringArray: true,
                  stringArrayEncoding: ["base64"],
                }
              );
              fs.mkdirSync(path.dirname(outputFile), { recursive: true });
              fs.writeFileSync(outputFile, obfuscatedResult.getObfuscatedCode(), "utf8");
              console.log(`Minified and obfuscated ${file} -> ${outputFile}`);
            }
          } else if (fileExtension === ".css") {
            const css = fs.readFileSync(file, "utf8");
            const result = new CleanCSS({}).minify(css);
            if (result.errors.length) {
              console.error(`Error minifying ${file}:`, result.errors);
            } else {
              fs.mkdirSync(path.dirname(outputFile), { recursive: true });
              fs.writeFileSync(outputFile, result.styles, "utf8");
              console.log(`Minified ${file} -> ${outputFile}`);
            }
          } else if (fileExtension === ".html") {
            const html = fs.readFileSync(file, "utf8");
            minifyHTML(html, {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: true,
            })
              .then((minifiedHTML) => {
                fs.mkdirSync(path.dirname(outputFile), { recursive: true });
                fs.writeFileSync(outputFile, minifiedHTML, "utf8");
                console.log(`Minified ${file} -> ${outputFile}`);
              })
              .catch((error) => console.error(`Error minifying ${file}:`, error));
          } else {
            copyFileOrDir(file, outputFile);
          }
        } catch (error) {
          console.error(`Error processing ${file}:`, error);
        }
      });

      resolve();
    });
  });
}


/**
 * Asynchronously updates the package.json version and productName based on user input,
 * writes the updated package.json to disk, updates the dbconfig.js file with the selected database configuration,
 * dynamically loads the ora package, starts a spinner for the build process,
 * spawns the electron-builder process, captures its output, and handles success/failure scenarios.
 */
let spinner;
async function updatePackageAndBuild() {
  try {
    // Start timestamp
    const startTime = Date.now();
    const answers = await promptUser();

    const outputDir = path.resolve(__dirname, `dist/${answers.client}/bank`); 

    //delete the dist folder
    if (fs.existsSync(outputDir)) {
      fs.rmdirSync(outputDir, { recursive: true });
    }
    // Update the package.json version and productName
    packageJson.version = answers.version;
    packageJson.build.productName = answers.productName;
    packageJson.build.directories.output = `dist/${answers.client}/bank`;
    packageJson.main = "release/index.js";

    // Write the updated package.json back to disk
    fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));

    // Update dbconfig.js based on selected database
    updateDbConfig(answers.database);

    // Minify and copy files
    console.log("Starting minification And obfuscation...");
    await minifyAndCopyFiles();
    console.log("Minification and obfuscation completed.");

    // Dynamically load ora and start the spinner
    const ora = await loadOra();
    spinner = ora("Initializing build process...").start();

    // Spawn electron-builder process and capture stdout/stderr
    const buildProcess = spawn("electron-builder", ["--publish=never"], {
      shell: true,
    });

    buildProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("electron-builder")) {
        spinner.text = "Building started...";
      } else if (output.includes("loaded configuration")) {
        spinner.text = "Loaded configuration...";
      } else if (output.includes("installing native dependencies")) {
        spinner.text = "Installing native dependencies...";
      } else if (output.includes("packaging")) {
        spinner.text = "Packaging application...";
      } else if (output.includes("Build completed successfully")) {
        spinner.succeed("✔ Build completed successfully!");
      } else {
        spinner.text = output;
      }
    });

    buildProcess.stderr.on("data", (data) => {
      const error = data.toString();
      console.error(`Error during build: ${error}`);
      spinner.fail(`Build failed with error: ${error}`);
    });

    buildProcess.on("close", async (code) => {
      restoreDbConfig();
      packageJson.main = "src/index.js";
      fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
      if (code === 0) {
        // Collect system information
        const timeDate = new Date();
        const logData = {
          UUID: uuid.v4(),
          BuildVersion: answers.version,
          BuildID: createBuildID(answers.version, answers.productName),
          CommitHash: getGitCommitHash(),
          RepositoryURL: getGitRepositoryURL(),
          BranchName: getGitBranchName(),
          UncommittedChanges: checkUncommittedChanges(),
          SystemInfo: getSystemInfo(),
          Timestamp: formatTimestamp(timeDate),
        };
       
        buildApplication(outputDir);

        // Collect build duration
        const endTime = Date.now();
        const durationInSeconds = (endTime - startTime) / 1000;                                          
        const formattedDuration = formatDuration(durationInSeconds);
        logData.BuildDuration = formattedDuration;

        // Collect build artifact information
        logData.BuildArtifacts = getBuildArtifactsMetadata(outputDir);
        logData.OutputDirectory = outputDir;

        // Send log data to the central database
        await sendToCentralDB(logData, outputDir);

        spinner.succeed("Build completed successfully!");
      } else {
        spinner.fail(`Build process exited with code ${code}`);
      }
    });

    // Handle Ctrl+C / SIGINT to clean up
    process.on("SIGINT", () => {
      console.log("\nBuild process interrupted by user. Cleaning up...");
      restoreDbConfig();
      packageJson.main = "src/index.js";
      fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
      if (spinner) spinner.fail("Build cancelled by user.");
      process.exit(1);
    });
  } catch (error) {
    if (spinner) spinner.fail("An error occurred during the build process.");
    console.error("Error:", error);
    restoreDbConfig();
    packageJson.main = "src/index.js";
    fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
  }
}

// Execute the function
updatePackageAndBuild();


//------------- section of build metadata collection and send that to the central database ------------------

//this function will create a build id based on version and product name and date time
function createBuildID(version, productName) {
  return `${productName}-${version}-${new Date().toISOString().replace(/[-:.]/g, '')}`;
}

// Function to get the current Git commit hash
function getGitCommitHash() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'Unknown';
  }
}

// Function to get the Git repository URL
function getGitRepositoryURL() {
  try {
    return execSync('git config --get remote.origin.url').toString().trim();
  } catch {
    return 'Unknown';
  }
}

// Function to get the current Git branch name
function getGitBranchName() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {
    return 'Unknown';
  }
}

// Function to check for uncommitted changes
function checkUncommittedChanges() {
  try {
    const status = execSync('git status --porcelain').toString().trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

// Function to collect system information
function getSystemInfo() {
  return {
    IPAddress: getIPAddress(),
    MACAddress: getMACAddress(),
    HostName: os.hostname(),
    OperatingSystem: `${os.type()} ${os.release()} (${os.arch()})`,
    Processor: `${os.cpus()[0].model} (${os.cpus().length} cores)`,
    RAM: `${(os.totalmem() / 1024 ** 3).toFixed(2)} GB`,
    Username: os.userInfo().username,
  };
}

// Helper function to get the IP address
function getIPAddress() {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceDetails of Object.values(networkInterfaces)) {
    for (const iface of interfaceDetails || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'Unknown';
}

// Helper function to get the MAC address
function getMACAddress() {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceDetails of Object.values(networkInterfaces)) {
    for (const iface of interfaceDetails || []) {
      if (!iface.internal && iface.mac) {
        return iface.mac;
      }
    }
  }
  return 'Unknown';
}

// Function to simulate the build process
function buildApplication(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  // Simulate artifact creation
  const artifactPath = path.join(outputDir, 'app.asar');
  fs.writeFileSync(artifactPath, 'Dummy artifact content');
}


// Function to collect build artifact metadata
function getBuildArtifactsMetadata(outputDir) {
  const artifacts = [];
  const files = fs.readdirSync(outputDir);
  for (const file of files) {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);

      // Ensure the path is a file, not a directory
      if (stats.isFile()) {
          const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
          artifacts.push({
              FilePath: filePath,
              Size: formatFileSize(stats.size), // Use formatted size
              SHA256: hash,
          });
      }
  }
  return artifacts;
}

// Function to format file size in human-readable format
function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;

  while (bytes >= 1024 && unitIndex < units.length - 1) {
      bytes /= 1024;
      unitIndex++;
  }

  return `${bytes.toFixed(2)} ${units[unitIndex]}`;
}

// Function to format duration into "00h,02min,52sec"
function formatDuration(durationInSeconds) {
  const hours = Math.floor(durationInSeconds / 3600);
  const minutes = Math.floor((durationInSeconds % 3600) / 60);
  const seconds = Math.floor(durationInSeconds % 60);

  return `${String(hours).padStart(2, '0')}h,${String(minutes).padStart(2, '0')}min,${String(seconds).padStart(2, '0')}sec`;
}

// Function to format timestamp in a readable format
function formatTimestamp(date) {
  const options = {
      year: 'numeric',
      month: 'short', // "Jan", "Feb", etc.
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false, // Use 24-hour format
      timeZone: 'UTC', // Ensure the time is in UTC
      timeZoneName: 'short', // Include "UTC"
  };

  return new Intl.DateTimeFormat('en-GB', options).format(date).replace(', ', ',');
}

// Function to send log data to a central database
async function sendToCentralDB(logData, outputDir) {
  // Ensure the directory exists before writing the file
  const logDir = path.join(outputDir);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Construct the log file path
  const logFilePath = path.join(logDir, 'log.json');
  
  // Append the log data to the log file
  fs.appendFileSync(logFilePath, JSON.stringify(logData) + '\n');
}

