const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const express = require('express');

const app = express();
app.use(express.json());

exports.triggerBuild = (req, res) => {
    const electronProjectPath = config.electronProjectPath;
    const envFilePath = path.join(electronProjectPath, '.env');

    // Extract data from request body to update the .env file
    const { version, database_name } = req.body;

    // Prepare the .env content with the new values
    const updatedEnvContent = `VERSION=${version}\nDATABASE_NAME=${database_name}\n`;

    // Write the new content to the .env file
    fs.writeFile(envFilePath, updatedEnvContent, (err) => {
        if (err) {
            console.error(`Failed to update .env file: ${err.message}`);
            return res.status(500).json({
                message: 'Failed to update .env file',
                error: err.message,
            });
        }

        console.log('Successfully updated .env file');

        // Execute `npm run build` in the Electron project directory
        const buildProcess = spawn('npm', ['run', 'build'], { cwd: electronProjectPath, shell: true });

        let output = '';
        let errorOutput = '';

        // Capture stdout and stderr
        buildProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log(`Build stdout: ${data}`);
        });

        buildProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(`Build stderr: ${data}`);
        });

        // Handle process completion
        buildProcess.on('close', (code) => {
            if (code === 0) {
                const buildJsonPath = path.join(electronProjectPath, 'dist', 'log.json');

                // Read the build.json file
                fs.readFile(buildJsonPath, 'utf8', (readErr, buildData) => {
                    if (readErr) {
                        console.error(`Failed to read build.json: ${readErr.message}`);
                        return res.status(500).json({
                            message: 'Build completed, but failed to read build.json',
                            error: readErr.message,
                            output,
                        });
                    }

                    try {
                        const buildJson = JSON.parse(buildData);

                        // Send the response with the build.json data
                        res.json({
                            message: 'Build completed successfully',
                            build: buildJson,
                        });
                    } catch (parseErr) {
                        console.error(`Failed to parse build.json: ${parseErr.message}`);
                        res.status(500).json({
                            message: 'Build completed, but failed to parse build.json',
                            error: parseErr.message,
                            output,
                        });
                    }
                });
            } else {
                res.status(500).json({
                    message: 'Build failed',
                    error: errorOutput,
                });
            }
        });

        buildProcess.on('error', (err) => {
            console.error(`Failed to start build process: ${err.message}`);
            res.status(500).json({
                message: 'Failed to start build process',
                error: err.message,
            });
        });
    });
};
