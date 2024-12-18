const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Update the electron project path to the correct location
const electronProjectPath = 'C:/Users/kavin/Desktop/coopmis';
// Path to store builds
const buildStoragePath = 'C:/Users/kavin/Desktop/builds';

// Function to get the current Git commit hash
const getGitCommitHash = () => {
    try {
        return execSync('git rev-parse HEAD', { cwd: electronProjectPath }).toString().trim();
    } catch {
        return 'Unknown';
    }
};

// Function to get the Git repository URL
const getGitRepositoryURL = () => {
    try {
        return execSync('git config --get remote.origin.url', { cwd: electronProjectPath }).toString().trim();
    } catch {
        return 'Unknown';
    }
};

// Function to get the current Git branch name
const getGitBranchName = () => {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { cwd: electronProjectPath }).toString().trim();
    } catch {
        return 'Unknown';
    }
};

// Function to check for uncommitted changes
const checkUncommittedChanges = () => {
    try {
        const status = execSync('git status --porcelain', { cwd: electronProjectPath }).toString().trim();
        return status.length > 0;
    } catch {
        return false;
    }
};

// Function to get system information
const getSystemInfo = () => {
    const networkInterfaces = os.networkInterfaces();
    let ipAddress = 'Unknown';
    let macAddress = 'Unknown';

    for (const interfaceDetails of Object.values(networkInterfaces)) {
        for (const iface of interfaceDetails || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ipAddress = iface.address;
            }
            if (!iface.internal && iface.mac) {
                macAddress = iface.mac;
            }
        }
    }

    return {
        IPAddress: ipAddress,
        MACAddress: macAddress,
        HostName: os.hostname(),
        OperatingSystem: `${os.type()} ${os.release()} (${os.arch()})`,
        Processor: `${os.cpus()[0].model} (${os.cpus().length} cores)`,
        RAM: `${(os.totalmem() / 1024 ** 3).toFixed(2)} GB`,
        Username: os.userInfo().username,
    };
};

// Function to format file size
const formatFileSize = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;

    while (bytes >= 1024 && unitIndex < units.length - 1) {
        bytes /= 1024;
        unitIndex++;
    }

    return `${bytes.toFixed(2)} ${units[unitIndex]}`;
};

// Function to format duration
const formatDuration = (durationInSeconds) => {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);

    return `${String(hours).padStart(2, '0')}h,${String(minutes).padStart(2, '0')}min,${String(seconds).padStart(2, '0')}sec`;
};

// Function to format timestamp
const formatTimestamp = (date) => {
    const options = {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC',
        timeZoneName: 'short',
    };

    return new Intl.DateTimeFormat('en-GB', options).format(date).replace(', ', ',');
};

// Function to get build artifacts metadata for a specific app type
const getBuildArtifactsForType = (appType) => {
    const artifacts = [];
    const distPath = path.join(electronProjectPath, 'dist');
    const specificDistPath = path.join(distPath, 'sika', appType);
    
    if (fs.existsSync(specificDistPath)) {
        const files = fs.readdirSync(specificDistPath);
        
        for (const file of files) {
            const filePath = path.join(specificDistPath, file);
            const stats = fs.statSync(filePath);

            if (stats.isFile()) {
                if (file.endsWith('.exe') || 
                    file.endsWith('.blockmap') || 
                    file === 'app.asar' || 
                    file === 'builder-debug.yml' || 
                    file === 'latest.yml') {
                    
                    const hash = crypto.createHash('sha256')
                                     .update(fs.readFileSync(filePath))
                                     .digest('hex');
                    
                    artifacts.push({
                        AppType: appType,
                        FilePath: filePath,
                        Size: formatFileSize(stats.size),
                        SHA256: hash
                    });
                }
            }
        }
    }
    
    return artifacts;
};

// Function to get build artifacts metadata for all app types
const getBuildArtifactsMetadata = () => {
    const appTypes = ['bank', 'process', 'report'];
    let allArtifacts = [];
    
    for (const appType of appTypes) {
        const artifacts = getBuildArtifactsForType(appType);
        allArtifacts = allArtifacts.concat(artifacts);
    }
    
    return allArtifacts;
};

// Function to create build metadata
const createBuildMetadata = (version, buildPath, startTime) => {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // Convert to seconds

    return {
        BuildID: `combined-${version}-${new Date().toISOString().replace(/[-:.]/g, '')}`,
        Timestamp: formatTimestamp(endTime),
        Duration: formatDuration(duration),
        Version: version,
        GitInfo: {
            CommitHash: getGitCommitHash(),
            RepositoryURL: getGitRepositoryURL(),
            Branch: getGitBranchName(),
            HasUncommittedChanges: checkUncommittedChanges(),
        },
        SystemInfo: getSystemInfo(),
        BuildArtifacts: getBuildArtifactsMetadata()
    };
};

// Function to save build metadata
const saveBuildMetadata = (metadata) => {
    // Create _logs directory if it doesn't exist
    const logsPath = path.join(buildStoragePath, '_logs');
    if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
    }
    
    // Save the current build metadata
    const buildLogPath = path.join(logsPath, `build-${metadata.Version}-${new Date().getTime()}.json`);
    fs.writeFileSync(buildLogPath, JSON.stringify(metadata, null, 2));
    
    // Update the combined builds file
    const combinedBuilds = getCombinedBuilds();
    combinedBuilds.unshift(metadata); // Add new build at the beginning
    
    // Keep only the last 10 builds
    if (combinedBuilds.length > 10) {
        combinedBuilds.length = 10;
    }
    
    const combinedPath = path.join(buildStoragePath, 'combined-builds.json');
    fs.writeFileSync(combinedPath, JSON.stringify(combinedBuilds, null, 2));
};

// Function to get combined builds
const getCombinedBuilds = () => {
    const combinedPath = path.join(buildStoragePath, 'combined-builds.json');
    if (fs.existsSync(combinedPath)) {
        try {
            return JSON.parse(fs.readFileSync(combinedPath, 'utf8'));
        } catch (err) {
            console.error('Error reading combined builds:', err);
            return [];
        }
    }
    return [];
};

// Function to copy directory recursively
const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

exports.triggerBuild = (req, res) => {
    let isResponseSent = false;

    const sendResponse = (statusCode, data) => {
        if (!isResponseSent) {
            isResponseSent = true;
            res.status(statusCode).json(data);
        }
    };

    const handleError = (error, message) => {
        console.error(message, error);
        sendResponse(500, { message, error: error.toString() });
    };

    const { version, database_name, client } = req.body;
    const updatedEnvContent = `VERSION=${version}\nDATABASE_NAME=${database_name}\nCLIENT=${client}`;

    // Function to check if build was successful by checking dist directory
    const checkBuildSuccess = () => {
        const distPath = path.join(electronProjectPath, 'dist');
        try {
            // Check if dist directory exists and is not empty
            if (fs.existsSync(distPath)) {
                const files = fs.readdirSync(distPath);
                return files.length > 0;
            }
            return false;
        } catch (err) {
            console.error('Error checking build success:', err);
            return false;
        }
    };

    // Function to build an app
    const buildApp = (appType, branchName) => {
        return new Promise((resolve, reject) => {
            const startTime = new Date();
            console.log(`Starting build process for ${appType}`);
            
            // Get version from package.json
            const packageJson = JSON.parse(fs.readFileSync(path.join(electronProjectPath, 'package.json'), 'utf8'));
            const version = packageJson.version;
            
            // First fetch all branches
            const gitFetchProcess = spawn('git', ['fetch', '--all'], { cwd: electronProjectPath, shell: true });
            
            gitFetchProcess.on('error', (error) => {
                reject(new Error(`Git fetch failed: ${error.message}`));
            });
            
            gitFetchProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Git fetch failed with code ${code}`));
                    return;
                }
                
                // Stash any changes before checkout
                const gitStash = spawn('git', ['stash'], { cwd: electronProjectPath, shell: true });
                
                gitStash.on('close', () => {
                    // Now try to checkout
                    const gitCheckoutProcess = spawn('git', ['checkout', branchName], { cwd: electronProjectPath, shell: true });
                    
                    let checkoutError = '';
                    gitCheckoutProcess.stderr.on('data', (data) => {
                        checkoutError += data.toString();
                    });
                    
                    gitCheckoutProcess.on('error', (error) => {
                        reject(new Error(`Git checkout failed: ${error.message}`));
                    });
                    
                    gitCheckoutProcess.on('close', (code) => {
                        if (code !== 0) {
                            reject(new Error(`Git checkout failed with code ${code}. Error: ${checkoutError}`));
                            return;
                        }

                        // Then do git pull
                        const gitPullProcess = spawn('git', ['pull'], { cwd: electronProjectPath, shell: true });
                        
                        gitPullProcess.on('error', (error) => {
                            reject(new Error(`Git pull failed: ${error.message}`));
                        });
                        
                        gitPullProcess.on('close', (code) => {
                            if (code !== 0) {
                                reject(new Error(`Git pull failed with code ${code}`));
                                return;
                            }

                            // Update .env file
                            try {
                                fs.writeFileSync(path.join(electronProjectPath, '.env'), updatedEnvContent);
                            } catch (err) {
                                reject(new Error(`Failed to update .env: ${err.message}`));
                                return;
                            }

                            // Delete node_modules and dist directory
                            try {
                                const nodeModulesPath = path.join(electronProjectPath, 'node_modules');
                                const distPath = path.join(electronProjectPath, 'dist');
                                if (fs.existsSync(nodeModulesPath)) {
                                    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
                                }
                                if (fs.existsSync(distPath)) {
                                    fs.rmSync(distPath, { recursive: true, force: true });
                                }
                            } catch (err) {
                                console.error('Error cleaning directories:', err);
                            }

                            console.log(`Installing dependencies for ${appType}...`);
                            const installProcess = spawn('npm', ['install', '--legacy-peer-deps'], { cwd: electronProjectPath, shell: true });

                            let installOutput = '';
                            installProcess.stdout.on('data', (data) => {
                                installOutput += data;
                            });

                            installProcess.stderr.on('data', (data) => {
                                installOutput += data;
                            });

                            installProcess.on('error', (error) => {
                                reject(new Error(`npm install failed: ${error.message}`));
                            });

                            installProcess.on('close', (code) => {
                                if (code !== 0) {
                                    reject(new Error(`npm install failed with code ${code}. Output: ${installOutput}`));
                                    return;
                                }

                                console.log(`Starting build for ${appType}...`);
                                const buildProcess = spawn('npm', ['run', 'build'], { cwd: electronProjectPath, shell: true });

                                let buildOutput = '';
                                buildProcess.stdout.on('data', (data) => {
                                    const output = data.toString();
                                    buildOutput += output;
                                    console.log(`${appType} build: ${output}`);
                                });

                                buildProcess.stderr.on('data', (data) => {
                                    const error = data.toString();
                                    buildOutput += error;
                                    console.error(`${appType} build error: ${error}`);
                                });

                                buildProcess.on('error', (error) => {
                                    reject(new Error(`Build process error: ${error.message}`));
                                });

                                buildProcess.on('close', (code) => {
                                    // Check build success by verifying dist directory
                                    if (checkBuildSuccess()) {
                                        console.log(`${appType} build completed successfully`);
                                        
                                        // Create build storage path
                                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                        const buildPath = path.join(buildStoragePath, appType, `${version}_${timestamp}`);
                                        
                                        // Store build artifacts
                                        try {
                                            copyDir(path.join(electronProjectPath, 'dist'), buildPath);
                                            
                                            // Create and save build metadata
                                            if (appType === 'report') { // Last build in sequence
                                                try {
                                                    const metadata = createBuildMetadata(version, buildStoragePath, startTime);
                                                    saveBuildMetadata(metadata);
                                                    console.log('Build metadata saved successfully');
                                                } catch (err) {
                                                    console.error('Error saving build metadata:', err);
                                                }
                                            }
                                        } catch (err) {
                                            reject(new Error(`Failed to store build artifacts: ${err.message}`));
                                            return;
                                        }

                                        // Git operations
                                        const gitAdd = spawn('git', ['add', '.'], { cwd: electronProjectPath, shell: true });
                                        
                                        gitAdd.on('error', (error) => reject(new Error(`Git add failed: ${error.message}`)));
                                        
                                        gitAdd.on('close', (code) => {
                                            if (code !== 0) {
                                                reject(new Error(`Git add failed with code ${code}`));
                                                return;
                                            }

                                            const commitMsg = `new client build version - ${version} ${client} for ${appType}`;
                                            const gitCommit = spawn('git', ['commit', '-m', commitMsg], { cwd: electronProjectPath, shell: true });
                                            
                                            gitCommit.on('error', (error) => reject(new Error(`Git commit failed: ${error.message}`)));
                                            
                                            gitCommit.on('close', (code) => {
                                                if (code !== 0 && code !== 1) { // code 1 might mean nothing to commit
                                                    reject(new Error(`Git commit failed with code ${code}`));
                                                    return;
                                                }

                                                // Force push to ensure changes are uploaded
                                                const gitPush = spawn('git', ['push', '-f', 'origin', branchName], { cwd: electronProjectPath, shell: true });
                                                gitPush.on('error', (error) => reject(new Error(`Git push failed: ${error.message}`)));
                                                
                                                gitPush.on('close', (code) => {
                                                    if (code !== 0) {
                                                        reject(new Error(`Git push failed with code ${code}`));
                                                        return;
                                                    }
                                                    resolve();
                                                });
                                            });
                                        });
                                    } else {
                                        reject(new Error(`${appType} build failed. Build output: ${buildOutput}`));
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });
    };

    // Create build storage directory if it doesn't exist
    if (!fs.existsSync(buildStoragePath)) {
        fs.mkdirSync(buildStoragePath, { recursive: true });
    }

    // Sequential build process
    console.log('Starting sequential build process...');
    buildApp('bank', 'coopmis-bank-dev')
        .then(() => buildApp('process', 'coop_process_dev'))
        .then(() => buildApp('report', 'report-dev'))
        .then(() => {
            console.log('All builds completed successfully');
            sendResponse(200, { message: 'All builds completed successfully' });
        })
        .catch((error) => {
            handleError(error, 'Build process failed');
        });
};
