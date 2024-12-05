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
    const { version, database_name, client_id } = req.body;

    // Prepare the .env content with the new values
    const updatedEnvContent = `VERSION=${version}\nDATABASE_NAME=${database_name}\nCLIENT=${client_id}\n`;

    // Write the new content to the .env file
    fs.writeFileSync(envFilePath, updatedEnvContent);

    // send response as build started message
    res.status(200).json({ message: 'Build started' });

    // chechout the coopmis-bank-dev branch
    const checkoutCommand = `git checkout coopmis-bank-dev`;
    const checkoutProcess = spawn(checkoutCommand, { shell: true, cwd: electronProjectPath });
    checkoutProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });
    checkoutProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
    checkoutProcess.on('close', (code) => {
        if (code === 0) {
            console.log('Checkout successful');
        } else {
            console.error(`Error checking out branch: ${code}`);
        }
    });

    // delete the node_modules folder
    const nodeModulesPath = path.join(electronProjectPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    }

    // install dependencies with clean install
    const installCommand = 'npm install';
    const installProcess = spawn(installCommand, { shell: true, cwd: electronProjectPath });
    installProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });
    installProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
    installProcess.on('close', (code) => {
        if (code === 0) {
            console.log('Dependencies installed successfully');
        } else {
            console.error(`Error installing dependencies: ${code}`);
        }
    });

    // build the electron app
    const buildCommand = 'npm run build';
    const buildProcess = spawn(buildCommand, { shell: true, cwd: electronProjectPath });
    buildProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });
    buildProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
    buildProcess.on('close', (code) => {
        if (code === 0) {
            console.log('Build successful');
        } else {
            console.error(`Error building app: ${code}`);
        }
    });

    // read the log.JSON file in the disr/client_id folder
    const logFilePath = path.join(electronProjectPath, 'dist', client_id,'bank', 'log.JSON');
    const logFileContent = fs.readFileSync(logFilePath, 'utf8');
    
    const { BuildArtifacts, ...otherData } = data;
    const buildArtafact = logFileContent.BuildArtifacts;

    
};
