import { MongoOperation } from './MongoOperation';

interface GeneralResponse {
    clusterTime?: Date;
    ns?: {
        db: string,
        coll: string
    },
    operation?: MongoOperation;
    additional?: 'close' | 'end' | 'erroned';
    hasNext?: boolean
}

interface InsertResponse extends GeneralResponse {
    toInsert?: any;
}

interface UpdateResponse extends GeneralResponse {
    toUpdate?: any;
    toDelete?: string[];
    wheres?: any;
}

interface DeleteResponse extends GeneralResponse {
    wheres?: any;
}

type WatchResponse = InsertResponse | UpdateResponse | DeleteResponse;

export { InsertResponse, UpdateResponse, DeleteResponse, WatchResponse };
