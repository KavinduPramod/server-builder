require('dotenv').config();

const config = {
    electronProjectPath: process.env.ELECTRON_PROJECT_PATH || '/default/path',
    port: process.env.PORT || 3000,
    apiKey: process.env.API_KEY || 'default-api-key',
};

if (!process.env.ELECTRON_PROJECT_PATH) {
    console.error('Error: ELECTRON_PROJECT_PATH is not defined in .env');
    process.exit(1);
}

module.exports = config;
