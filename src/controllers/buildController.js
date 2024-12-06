const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const express = require('express');

const app = express();
app.use(express.json());

exports.triggerBuild = async (req, res) => {
    try {
        const electronProjectPath = config.electronProjectPath;
        const envFilePath = path.join(electronProjectPath, '.env');

        // Extract data from request body
        const { version, database_name, client_id } = req.body;

        if (!version || !database_name || !client_id) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Function to execute shell command and return promise
        const executeCommand = (command, cwd) => {
            return new Promise((resolve, reject) => {
                const process = spawn(command, { shell: true, cwd });

                process.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                });

                process.stderr.on('data', (data) => {
                    console.error(`stderr: ${data}`);
                });

                process.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Command failed with code ${code}`));
                    }
                });
            });
        };

        // Function to build an app
        const buildApp = async (branch, appType) => {
            // Checkout branch
            await executeCommand(`git checkout ${branch}`, electronProjectPath);

            // Update env file
            const updatedEnvContent = `VERSION=${version}\nDATABASE_NAME=${database_name}\nCLIENT=${client_id}\n`;
            fs.writeFileSync(envFilePath, updatedEnvContent);

            // Clean and rebuild
            if (fs.existsSync(path.join(electronProjectPath, 'node_modules'))) {
                fs.rmSync(path.join(electronProjectPath, 'node_modules'), { recursive: true });
            }

            await executeCommand('npm install', electronProjectPath);
            await executeCommand('npm run build', electronProjectPath);

            // Wait for build to complete and file to be created
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for file system

            const logPath = path.join(electronProjectPath, 'dist', client_id, appType, 'log.JSON');
            if (fs.existsSync(logPath)) {
                return JSON.parse(fs.readFileSync(logPath, 'utf8'));
            }
            return { BuildArtifacts: [] };
        };

        // Build all apps sequentially
        const bankLog = await buildApp('coopmis-bank-dev', 'bank');
        const processLog = await buildApp('coopmis-process-dev', 'process');
        const reportLog = await buildApp('report-dev', 'report');

        // Combine build artifacts
        const buildArtifacts = [
            ...bankLog.BuildArtifacts || [],
            ...processLog.BuildArtifacts || [],
            ...reportLog.BuildArtifacts || []
        ];

        // Write final logs
        const finalLog = {
            ...bankLog,
            BuildArtifacts: buildArtifacts
        };

        // Send single response after everything is complete
        res.status(200).json({
            message: 'Build completed successfully',
            buildArtifacts,
            logs: {
                bank: bankLog,
                process: processLog,
                report: reportLog
            }
        });

    } catch (error) {
        console.error('Build error:', error);
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Build process failed',
                message: error.message
            });
        }
    }
};
