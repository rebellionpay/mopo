import fs from 'fs';
import Logger from './logger';

interface Config {
    mongo: {
        connection: {
            uri: string;
            options: object;
        },
        collectionModels: { [key: string]: any[] };
    };
    postgres: {
        connection: {
            config: object;
        }
    }
    sync: [
        {
            collection: string;
            watchOperations: string[];
            syncAll: boolean;
        }
    ]
};

function loadConfig(path: string): Promise<Config> {
    Logger.log('debug', 'Loading config from path: ' + path);
    return new Promise((resolve, reject) => {
        fs.readFile(path, 'utf8', (err: any, data: string) => {
            if (err) return reject(err);
            const config: Config = JSON.parse(data);
            return resolve(config);
        });
    });
}

export { Config, loadConfig };
