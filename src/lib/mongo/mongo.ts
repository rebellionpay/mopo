import mongoose from 'mongoose';
import EventEmitter from 'events';

import Logger from '../logger';
import { MongoOperation } from './MongoOperation';
import { WatchResponse } from './WatchResponse';

class Mongo {
    uri: string;
    options: mongoose.ConnectOptions;
    client: mongoose.Mongoose | undefined;
    queueChangesListener: EventEmitter;

    constructor(uri: string, options: mongoose.ConnectOptions) {
        this.uri = uri;
        this.options = options;
        this.queueChangesListener = new EventEmitter();
    }

    async start() {
        Logger.log('info', `Launching mongo/start`);
        await this.connect();
        this.prepare();
    }
    async connect(): Promise<void> {
        Logger.log('info', `Launching mongo/connect`);
        this.client = await mongoose.connect(this.uri, this.options);
    }
    async disconnect(): Promise<void> {
        Logger.log('info', `Launching mongo/disconnect`);
        return this.client?.disconnect();
    }

    async prepare() {
        Logger.log('info', `Launching mongo/prepare`);
        mongoose.connection.on('error', (err) => Logger.log('error', 'mongoose error', err));
    }

    async countDocuments(filter: object, collection: string): Promise<number> {
        return await mongoose.connection.collection(collection).countDocuments(filter);
    }

    async findBulk(filter: object = {}, collection: string, callback: (res?: WatchResponse, error?: Error) => Promise<void>) {
        const mCollection = mongoose.connection.collection(collection);

        let resolvedCount = 0;
        const cursor = mCollection.find(filter).skip(resolvedCount).stream();
        Logger.log('info', `Launching mongo/findBulk`, `withIndex: ${resolvedCount}`);
        cursor.on('error', async (err) => {
            Logger.log('error', 'mongoose findAll error', err);

            if (!cursor.isClosed()) {
                await cursor.close();
            }
            this.findBulk(filter, collection, callback); // recursive
        });
        cursor.on('close', () => callback({ additional: 'close' }));
        cursor.on('end', () => callback({ additional: 'end' }));
        cursor.on('data', async (doc) => {
            try {
                cursor.pause();
                await callback({
                    toInsert: doc,
                    hasNext: cursor.isClosed() ? false : (await cursor.hasNext()),
                });
            } catch (error) {
                await callback(undefined, error);
            } finally {
                resolvedCount += 1;
                cursor.resume();
            }
        });
    }
    async listen(collection: string, operations: MongoOperation[], callback: (res?: WatchResponse, error?: Error) => Promise<void>) {
        Logger.log('info', `Launching ${require.main?.filename}/listen - ${collection}`);
        const wantedOperations: string[] = operations.map((operation) => operation.toString());
        const mCollection = mongoose.connection.collection(collection);

        const changeStream = mCollection.watch().stream();

        changeStream
            .on('error', (err) => Logger.log('error', 'mongoose changeStream error', err))
            .on('close', () => callback({ additional: 'close' }))
            .on('end', () => callback({ additional: 'end' }))
            .on('data', async (change: any) => {
                if (wantedOperations.indexOf(change.operationType) > -1) {
                    try {
                        changeStream.pause();
                        let toReturn: WatchResponse = change;
                        switch (change.operationType) {
                            case MongoOperation.INSERT.toString():
                                toReturn = {
                                    toInsert: change.fullDocument,
                                    operation: MongoOperation.INSERT,
                                };
                                break;
                            case MongoOperation.UPDATE.toString():
                                toReturn = {
                                    toUpdate: change.updateDescription.updatedFields,
                                    toDelete: change.updateDescription.removedFields,
                                    wheres: change.documentKey,
                                    operation: MongoOperation.UPDATE,
                                };
                                break;
                            case MongoOperation.DELETE.toString():
                                toReturn = {
                                    wheres: change.documentKey,
                                    operation: MongoOperation.DELETE,
                                };
                                break;
                            default:
                                break;
                        }
                        toReturn = { ...toReturn, clusterTime: change.clusterTime, ns: change.ns };
                        await callback(toReturn);
                    } catch (error) {
                        await callback(undefined, error);
                    } finally {
                        changeStream.resume();
                    }

                }
            });
    }
}

export { Mongo };
