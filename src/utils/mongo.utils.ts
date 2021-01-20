import { ColumnType } from '../lib/postgres/PostgresTable';
import _ from 'lodash';
import PostgresValue from '../lib/postgres/PostgresValue';

function getColumnsFromSchema(tableSchema: { [key: string]: any }): ColumnType[] {
    const columns: ColumnType[] = [];
    const keys: string[] = Object.keys(tableSchema);
    for (const columnName of keys) {
        const type = tableSchema[columnName];
        columns.push({ columnName, type });
    }

    return columns;
}
function deleteIgnoredColumns(values: PostgresValue[], columnsToIgnore: string[]) {
    const colListRaw = values.map((v) => v.columnName);

    for (const col of columnsToIgnore) {// delete columns to ignore
        const deleteIndex = colListRaw.indexOf(col);
        if (deleteIndex > -1) {
            values.splice(deleteIndex, 1);
        }
    }
}


export { getColumnsFromSchema, deleteIgnoredColumns };