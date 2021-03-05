#!/usr/bin/env node
import { Command, OptionValues } from 'commander';
import Graceful from 'node-graceful';
import ora from 'ora';

import { Config, loadConfig } from './lib/config';
import Logger from './lib/logger';
import { Mongo } from './lib/mongo/mongo';
import { MongoOperation, parseMongoOperation } from './lib/mongo/MongoOperation';
import Timer from './lib/timer';
import { Postgres } from './lib/postgres/postgres';
import { DeleteResponse, InsertResponse, UpdateResponse, WatchResponse } from './lib/mongo/WatchResponse';
import { PostgresTable } from './lib/postgres/PostgresTable';
import PostgresValue from './lib/postgres/PostgresValue';

import { convertToPostgresValues } from './utils/postgres.util';

Graceful.captureExceptions = true;

async function main(options: OptionValues): Promise<void> {
    try {
        // tslint:disable-next-line: no-unused-expression
        new Logger({ level: options.logLevel || 'info' });

        if (options.start) {
            const config: Config = await loadConfig(options.start);

            const listenOnlys = options.listenOnly ? options.listenOnly.split(',') : [];
            const syncOnlys = options.syncAllOnly ? options.syncAllOnly.split(',') : [];

            const mongo: Mongo = new Mongo(config.mongo.connection.uri, config.mongo.connection.options);
            const postgres: Postgres = new Postgres(config.postgres.connection.config);
            await mongo.start();
            await postgres.connect();
            prepareExit(mongo, postgres);

            for (const { collection, watchOperations } of config.sync) {
                const isThisListening = typeof listenOnlys.find((c: string) => c === collection) !== 'undefined';
                const isThisSyncAll = typeof syncOnlys.find((c: string) => c === collection) !== 'undefined';

                const tableSchema = config.mongo.collectionModels[collection];

                const table = await postgres.getTable(collection, tableSchema, { create: options.createTables, ifNotExists: true });

                let operations: (MongoOperation | undefined)[] = watchOperations.map((operationStr) => parseMongoOperation(operationStr));
                operations = operations.filter((op) => typeof op !== 'undefined');

                if ((options.syncAll || isThisSyncAll) && !(options.listenOnly && isThisListening)) {
                    await syncAll(mongo, postgres, collection, table, {
                        bulkInsert: {
                            active: typeof options.bulkInsert !== 'undefined',
                            bufferLimit: parseInt(options.bulkInsert, 10),
                        }
                    });
                }

                if ((options.listenOnly && isThisListening) || !options.listenOnly) {
                    mongo.listen(collection, operations as MongoOperation[], async (change?: WatchResponse, error?: Error) => {
                        if (error) {
                            return Logger.log('error', error);
                        }

                        if (change?.additional) {
                            switch (change.additional) {
                                case 'close':
                                    Logger.log('verbose', 'Mongo listen close');
                                    break;
                                case 'end':
                                    Logger.log('verbose', 'Mongo listen end');
                                    break;
                                case 'erroned':
                                    Logger.log('error', 'Mongo listen erroned');
                                    if (options.strictListen) process.exit(1);
                                    break;
                                default:
                                    break;
                            }
                            return;
                        }


                        switch (change?.operation) {
                            case MongoOperation.INSERT:
                                Logger.log('verbose', 'INSERTING DOCUMENT OF ' + table.tableName);

                                const { toInsert } = change as InsertResponse;
                                const insertConverted = convertToPostgresValues(toInsert, table.columns);

                                await postgres.insert(table, insertConverted);
                                break;
                            case MongoOperation.UPDATE:
                                Logger.log('verbose', 'UPDATE DOCUMENT OF ' + table.tableName);

                                const { toUpdate, toDelete, wheres: updateWheres } = change as UpdateResponse;
                                const convertedWheresUpdate: PostgresValue[] = convertToPostgresValues(updateWheres, table.columns);
                                const updateConverted = convertToPostgresValues(toUpdate, table.columns);

                                await postgres.update(table, updateConverted, (toDelete as string[]), convertedWheresUpdate);
                                break;
                            case MongoOperation.DELETE:
                                Logger.log('verbose', 'DELETE DOCUMENT OF ' + table.tableName);

                                const { wheres: deleteWheres } = change as DeleteResponse;
                                const convertedWheresDelete: PostgresValue[] = convertToPostgresValues(deleteWheres, table.columns);

                                await postgres.delete(table, convertedWheresDelete);
                                break;
                            default:
                                Logger.log('verbose', 'NOT IMPLEMENTED ERROR', change);
                                break;
                        }
                    });
                }
            }
            if (mongo.listeners.length === 0) {
                Logger.log('info', 'Listeners count ' + mongo.listeners.length, 'Closing...');
                await exit(mongo, postgres);
            }
        }
    } catch (error) {
        Logger.log('error', 'ERROR', error);
    }
}

function syncAll(mongo: Mongo, postgres: Postgres, collection: string, table: PostgresTable, opt: { bulkInsert: { bufferLimit: number, active: boolean } }) {
    return new Promise(async (resolve, reject) => {
        const spinner = ora({ prefixText: 'SYNC ALL ' + collection, color: 'red' });
        const timer = new Timer();

        try {
            spinner.start();
            Logger.log('info', 'START syncAll ' + table.tableName);
            const totalDocs = await mongo.countDocuments({}, collection);
            let count = 0;

            mongo.findBulk({}, collection, async (res?: WatchResponse, error?: Error) => {
                count += 1;
                if (error) {
                    return Logger.log('error', 'FINDBULK ERROR', error);
                }

                if (res?.additional) {
                    switch (res.additional) {
                        case 'close':
                            Logger.log('verbose', 'Mongo findBulk close ' + collection);
                            break;
                        case 'end':
                            spinner.succeed(`${count}/${totalDocs} - ${(count / totalDocs * 100).toFixed(2)}% | ${timer.seconds}s`)
                            Logger.log('verbose', 'Mongo findBulk end');
                            resolve(true);
                        default:
                            break;
                    }
                    return;
                }

                const { toInsert } = res as InsertResponse;
                const insertConverted = convertToPostgresValues(toInsert, table.columns)
                await postgres.insert(table, insertConverted, { useQueue: { active: opt.bulkInsert.active, bufferLimit: opt.bulkInsert.bufferLimit, forceSend: !res?.hasNext } });

                spinner.text = `${count}/${totalDocs} - ${(count / totalDocs * 100).toFixed(2)}% | ${timer.seconds}s`;
            });
        } catch (error) {
            spinner.fail(`Sync failed at ${timer.seconds}s`);
            reject(error);
        }
    })
}


function prepareExit(mongo: Mongo, postgres: Postgres): void {
    Graceful.on('exit', async () => {
        await exit(mongo, postgres)
    });
}

async function exit(mongo: Mongo, postgres: Postgres) {
    Logger.log('info', 'Disconnecting from databases');
    await mongo.disconnect();
    await postgres.disconnect();
}

const program = new Command();

program
    .option('-s, --start <config file>', 'start sync with config file')
    .option('-c, --create-tables', 'Create tables', false)
    .option('-sa, --sync-all', 'Sync all data from all collections')
    .option('-sao, --sync-all-only <collections>', 'Sync all data from listed')
    .option('-lo, --listen-only <collections>', 'Listen only given collections.')
    .option('-bi, --bulk-insert <number>', 'Number of documents to insert at once (only works if --sync-all enabled). Default 10.')
    .option('-l, --log-level <level>', 'Log level')
    .option('-sl, --strict-listen', 'Strict listen mode. If error in listen exit happens');

if (process.argv.length === 2) program.help();
program.parse(process.argv);

main(program.opts());