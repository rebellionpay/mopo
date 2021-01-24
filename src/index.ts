import { Command, OptionValues } from 'commander';
import { Config, loadConfig } from "./lib/config";
import Logger from './lib/logger';
import { Mongo } from "./lib/mongo/mongo";
import { MongoOperation, parseMongoOperation } from "./lib/mongo/MongoOperation";
import { DeleteResponse, InsertResponse, UpdateResponse, WatchResponse } from './lib/mongo/WatchResponse';
import { Postgres } from './lib/postgres/postgres';
import { PostgresTable } from './lib/postgres/PostgresTable';
import PostgresValue from './lib/postgres/PostgresValue';
import { convertToPostgresValues } from './utils/postgres.util';
import { MultiProgressBars } from 'multi-progress-bars';
import exitHook from 'exit-hook';
import chalk from 'chalk';


const mpb = new MultiProgressBars({ persist: true, anchor: 'top', border: '-' });
let countTasks = 0;

async function main(options: OptionValues): Promise<void> {
    try {
        new Logger({ level: options.logLevel || 'info' });

        if (options.start) {
            const config: Config = await loadConfig(options.start);

            const mongo: Mongo = new Mongo(config.mongo.connection.uri, config.mongo.connection.options);
            const postgres: Postgres = new Postgres(config.postgres.connection.config);
            await mongo.start();
            await postgres.connect();
            prepareExit(mongo, postgres);

            for (const { collection, watchOperations, syncAll: syncAllConfig } of config.sync) {
                const tableSchema = config.mongo.collectionModels[collection];

                const table = await postgres.createTable(collection, tableSchema);

                let operations: (MongoOperation | undefined)[] = watchOperations.map((operationStr) => parseMongoOperation(operationStr));
                operations = operations.filter((op) => typeof op !== 'undefined');

                if (options.syncAll && syncAllConfig) {
                    await syncAll(mongo, postgres, collection, table);
                }

                mongo.listen(collection, <MongoOperation[]>operations, async (change: WatchResponse) => {
                    if (change.additional) {
                        switch (change.additional) {
                            case 'close':
                                Logger.log('verbose', 'Mongo listen close');
                                break;
                            case 'end':
                                Logger.log('verbose', 'Mongo listen end');
                            default:
                                break;
                        }
                        return;
                    }

                    switch (change.operation) {
                        case MongoOperation.INSERT:
                            Logger.log('verbose', 'INSERTING DOCUMENT OF ' + table.tableName);

                            const { toInsert } = <InsertResponse>change;
                            const insertConverted = convertToPostgresValues(toInsert, table.columns);

                            await postgres.insert(table, insertConverted);
                            break;
                        case MongoOperation.UPDATE:
                            Logger.log('verbose', 'UPDATE DOCUMENT OF ' + table.tableName);

                            const { toUpdate, toDelete, wheres: updateWheres } = <UpdateResponse>change;
                            const convertedWheresUpdate: PostgresValue[] = convertToPostgresValues(updateWheres, table.columns);
                            const updateConverted = convertToPostgresValues(toUpdate, table.columns);

                            await postgres.update(table, updateConverted, (toDelete as string[]), convertedWheresUpdate);
                            break;
                        case MongoOperation.DELETE:
                            Logger.log('verbose', 'DELETE DOCUMENT OF ' + table.tableName);

                            const { wheres: deleteWheres } = <DeleteResponse>change;
                            const convertedWheresDelete: PostgresValue[] = convertToPostgresValues(deleteWheres, table.columns);

                            await postgres.delete(table, convertedWheresDelete);
                            break;
                        default:
                            Logger.log('verbose', 'NOT IMPLEMENTED ERROR', change);
                            break;
                    }
                });
            }
            mpb.close();
        }
    } catch (error) {
        Logger.log('error', 'ERROR', error);
    }
}

function syncAll(mongo: Mongo, postgres: Postgres, collection: string, table: PostgresTable) {
    return new Promise(async (resolve, reject) => {
        const taskName = 'SYNC ALL ' + collection;

        try {
            mpb.addTask(taskName, { type: 'percentage', index: countTasks++, barColorFn: chalk.red });
            Logger.log('info', 'START syncAll ' + table.tableName);
            const totalDocs = await mongo.countDocuments({}, collection);
            let count = 0;

            mongo.findBulk({}, collection, async (res: WatchResponse) => {
                if (res.additional) {
                    switch (res.additional) {
                        case 'close':
                            Logger.log('verbose', 'Mongo findBulk close ' + collection);
                            break;
                        case 'end':
                            mpb.done(taskName, { message: 'end sync', barColorFn: chalk.blue });
                            Logger.log('verbose', 'Mongo findBulk end');
                            resolve(true);
                        default:
                            break;
                    }
                    return;
                }

                const { toInsert } = <InsertResponse>res;
                const insertConverted = convertToPostgresValues(toInsert, table.columns)
                await postgres.insert(table, insertConverted);
                mpb.updateTask(taskName, { percentage: count++ / totalDocs, message: `${count}/${totalDocs}` });
            });
        } catch (error) {
            reject(error);
        }
    })
}


function prepareExit(mongo: Mongo, postgres: Postgres): void {
    exitHook(async () => {
        Logger.log('info', 'Disconnecting from databases');
        await mongo.disconnect();
        await postgres.disconnect();
    });
}


const program = new Command();

program
    .option('-s, --start <config file>', 'start sync with config file')
    .option('-sa, --sync-all', 'Sync all data if syncAll in config sync')
    .option('-l, --log-level <level>', 'Log level');

program.parse(process.argv);

main(program.opts());