import mongoose from 'mongoose';
import Logger from '../logger';
import { MongoOperation } from './MongoOperation';
import { WatchResponse } from './WatchResponse';

class Mongo {
    uri: string;
    options: mongoose.ConnectOptions;
    client: mongoose.Mongoose | undefined;

    constructor(uri: string, options: mongoose.ConnectOptions) {
        this.uri = uri;
        this.options = options;
    }

    async start() {
        Logger.log('debug', `Launching mongo/start`);
        await this.connect();
        this.prepare();
    }
    async connect(): Promise<void> {
        Logger.log('debug', `Launching mongo/connect`);
        this.client = await mongoose.connect(this.uri, this.options);
    }
    async disconnect(): Promise<void> {
        Logger.log('debug', `Launching mongo/disconnect`);
        return this.client?.disconnect();
    }

    async prepare() {
        Logger.log('debug', `Launching mongo/prepare`);
        mongoose.connection.on('error', (err) => Logger.log('error', 'mongoose error', err));
    }

    async countDocuments(filter: object, collection: string): Promise<number> {
        return await mongoose.connection.collection(collection).countDocuments(filter);
    }

    async findBulk(filter: object = {}, collection: string, callback: (res: WatchResponse) => void) {
        const mCollection = mongoose.connection.collection(collection);
        const query = mCollection.find(filter).stream();
        query.on('error', (err) => Logger.log('error', 'mongoose findAll error', err));
        query.on('close', () => callback({ additional: 'close' }));
        query.on('end', () => callback({ additional: 'end' }));
        query.on('data', (doc) => {
            callback({
                toInsert: doc
            });
        });
    }
    async listen(collection: string, operations: MongoOperation[], callback: (res: WatchResponse) => void) {
        Logger.log('debug', `Launching ${require.main?.filename}/listen - ${collection}`);
        const wantedOperations: string[] = operations.map((operation) => operation.toString());
        const mCollection = mongoose.connection.collection(collection);

        const changeStream = mCollection.watch();

        changeStream
            .on('error', (err) => Logger.log('error', 'mongoose changeStream error', err))
            .on('close', () => callback({ additional: 'close' }))
            .on('end', () => callback({ additional: 'end' }))
            .on('change', (change: any) => {
                if (wantedOperations.indexOf(change.operationType) > -1) {
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
                    toReturn = { ...toReturn, ...{ clusterTime: change.clusterTime, ns: change.ns } };
                    callback(toReturn);
                }
            });
    }
}

export { Mongo };
