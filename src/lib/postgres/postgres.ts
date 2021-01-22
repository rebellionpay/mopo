import { Client, ClientConfig } from 'pg';
import Utils from 'util';
import { deleteIgnoredColumns, getColumnsFromSchema } from '../../utils/mongo.utils';
import { columnsToCreateTableStr } from '../../utils/postgres.util';
import Logger from '../logger';
import { ColumnType, PostgresTable } from './PostgresTable';
import PostgresValue from './PostgresValue';

class Postgres {
    client: Client;

    constructor(config: string | ClientConfig) {
        const client = new Client(config);
        this.client = client;
    }

    async connect(): Promise<void> {
        Logger.log('debug', `Launching postgres/connect`);
        await this.client.connect();
        this.prepare();
    }

    async prepare() {
        Logger.log('debug', `Launching postgres/prepare`);
        this.client
            .on('notification', (m) => Logger.log('info', m))
            .on('error', (err) => Logger.log('info', err))
            .on('notice', (m) => Logger.log('info', m))
            .on('end', () => Logger.log('info', 'POSTGRES CONNECTION END'));
    }
    async disconnect(): Promise<void> {
        Logger.log('debug', `Launching postgres/disconnect`);
        return this.client.end();
    }

    async createTable(tableName: string, tableSchema: object, opt: { ifNotExists: boolean } = { ifNotExists: true }): Promise<PostgresTable> {
        const columns: ColumnType[] = getColumnsFromSchema(tableSchema);
        const baseSQL = `CREATE TABLE ${opt.ifNotExists ? 'IF NOT EXISTS' : ''} %s (%s)`;
        const sql = Utils.format(baseSQL, tableName, columnsToCreateTableStr(columns));
        await this.client.query(sql);

        const table: PostgresTable = { tableName, columns };
        return table;
    }

    async insert(table: PostgresTable, values: PostgresValue[], opt: { replace: boolean, columnsToIgnore: string[] } = { replace: false, columnsToIgnore: ['__v'] }): Promise<void> {
        deleteIgnoredColumns(values, opt.columnsToIgnore);

        const colList = values.map((v) => JSON.stringify(v.columnName));
        const valList = values.map((v) => v.value ? `\$\$${(Array.isArray(v.value) || typeof v.value === 'object') ? JSON.stringify(v.value) : v.value}\$\$` : 'NULL');
        const baseSQL = '%s INTO "%s" (%s) VALUES (%s)';
        const sql = Utils.format(baseSQL, opt.replace ? 'REPLACE' : 'INSERT', table.tableName, colList.join(', '), valList.join(', '));
        Logger.log('debug', "INSERT", sql);
        await this.client.query(sql);
    }

    async update(table: PostgresTable, values: PostgresValue[], toDeleteValues: string[], wheres: PostgresValue[], opt: { columnsToIgnore: string[] } = { columnsToIgnore: ['__v'] }): Promise<void> {
        if (values.length === 0) {
            return Logger.log('warn', 'Trying to update without fields', JSON.stringify(wheres));
        };
        deleteIgnoredColumns(values, opt.columnsToIgnore);
        const setList = values.map((v) => `"${v.columnName}" = \$\$${(Array.isArray(v.value) || typeof v.value === 'object') ? JSON.stringify(v.value) : v.value}\$\$`);
        const toDeleteList = toDeleteValues.map((td) => `"${td}" = NULL"`);
        const whereList = wheres.map((w) => `"${w.columnName}" = \$\$${w.value}\$\$`);
        const baseSQL = 'UPDATE "%s" SET %s WHERE %s';

        const sql = Utils.format(baseSQL, table.tableName, [...setList, ...toDeleteList].join(', '), whereList.join(' AND '));
        Logger.log('debug', "UPDATE", sql);
        await this.client.query(sql);
    }

    async delete(table: PostgresTable, wheres: PostgresValue[], opt: {} = {}): Promise<void> {
        const whereList = wheres.map((w) => `"${w.columnName}" = \$\$${w.value}\$\$`);
        const baseSQL = 'DELETE FROM "%s" WHERE %s';

        const sql = Utils.format(baseSQL, table.tableName, whereList.join(' AND '));
        Logger.log('debug', "DELETE", sql);
        await this.client.query(sql);
    }
}
export { Postgres };
