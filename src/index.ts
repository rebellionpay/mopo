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
import cliProgress from 'cli-progress';
import exitHook from 'exit-hook';

async function main(options: OptionValues): Promise<void> {
    try {
        new Logger({ level: options.logLevel || 'debug' });

        if (options.start) {
            const config: Config = await loadConfig(options.start);

            const mongo: Mongo = new Mongo(config.mongo.connection.uri, config.mongo.connection.options);
            const postgres: Postgres = new Postgres(config.postgres.connection.config);
            await mongo.start();
            await postgres.connect();
            prepareExit(mongo, postgres);

            for (const { collection, watchOperations } of config.sync) {
                const tableSchema = config.mongo.collectionModels[collection];

                const table = await postgres.createTable(collection, tableSchema);

                let operations: (MongoOperation | undefined)[] = watchOperations.map((operationStr) => parseMongoOperation(operationStr));
                operations = operations.filter((op) => typeof op !== 'undefined');

                if (options.syncAll) {
                    await syncAll(mongo, postgres, collection, table);
                }

                mongo.listen(collection, <MongoOperation[]>operations, (change: WatchResponse) => {
                    if (change.additional) {
                        switch (change.additional) {
                            case 'close':
                                Logger.log('debug', 'Mongo listen close');
                                break;
                            case 'end':
                                Logger.log('debug', 'Mongo listen end');
                            default:
                                break;
                        }
                        return;
                    }

                    switch (change.operation) {
                        case MongoOperation.INSERT:
                            Logger.log('debug', 'INSERTING DOCUMENT OF ' + table.tableName);

                            const { toInsert } = <InsertResponse>change;
                            const insertConverted = convertToPostgresValues(toInsert, table.columns);

                            postgres.insert(table, insertConverted);
                            break;
                        case MongoOperation.UPDATE:
                            Logger.log('debug', 'UPDATE DOCUMENT OF ' + table.tableName);

                            const { toUpdate, toDelete, wheres: updateWheres } = <UpdateResponse>change;
                            const convertedWheresUpdate: PostgresValue[] = convertToPostgresValues(updateWheres, table.columns);
                            const updateConverted = convertToPostgresValues(toUpdate, table.columns);

                            postgres.update(table, updateConverted, (toDelete as string[]), convertedWheresUpdate);
                            break;
                        case MongoOperation.DELETE:
                            Logger.log('debug', 'DELETE DOCUMENT OF ' + table.tableName);

                            const { wheres: deleteWheres } = <DeleteResponse>change;
                            const convertedWheresDelete: PostgresValue[] = convertToPostgresValues(deleteWheres, table.columns);

                            postgres.delete(table, convertedWheresDelete);
                            break;
                        default:
                            Logger.log('debug', 'NOT IMPLEMENTED ERROR', change);
                            break;
                    }
                });
            }
        }
    } catch (error) {
        Logger.log('error', 'ERROR', error);
    }
}

function syncAll(mongo: Mongo, postgres: Postgres, collection: string, table: PostgresTable) {
    return new Promise(async (resolve, reject) => {
        try {
            const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
            Logger.log('info', 'START syncAll ' + table.tableName);
            const totalDocs = await mongo.countDocuments({}, collection);

            bar.start(totalDocs, 0);

            mongo.findBulk({}, collection, (res: WatchResponse) => {
                if (res.additional) {
                    switch (res.additional) {
                        case 'close':
                            Logger.log('debug', 'Mongo findBulk close ' + collection);
                            break;
                        case 'end':
                            bar.stop();
                            Logger.log('debug', 'Mongo findBulk end');
                            resolve(true);
                        default:
                            break;
                    }
                    return;
                }

                const { toInsert } = <InsertResponse>res;
                const insertConverted = convertToPostgresValues(toInsert, table.columns)
                postgres.insert(table, insertConverted);
                bar.increment();
            });
        } catch (error) {
            reject(error);
        }
    })
}


function prepareExit(mongo: Mongo, postgres: Postgres): void {
    exitHook(async () => {
        Logger.log('debug', 'Disconnecting from databases');
        await mongo.disconnect();
        await postgres.disconnect();
    });
}


const program = new Command();

program
    .option('-s, --start <config file>', 'start sync with config file')
    .option('-sa, --sync-all', 'Sync all data first')
    .option('-l, --log-level <level>', 'Log level');

program.parse(process.argv);

main(program.opts());