enum MongoOperation {
    INSERT = 'insert',
    REPLACE = 'replace',
    UPDATE = 'update',
    DELETE = 'delete',
    RENAME = 'rename',
    DROP = 'drop',
    DROP_DATABASE = 'dropDatabase',
    INVALIDATE = 'invalidate',
}

function parseMongoOperation(operation: string): MongoOperation | undefined {
    return Object.values(MongoOperation).find((op) => op.toString().toUpperCase() === operation.toUpperCase());
}

export { parseMongoOperation, MongoOperation };