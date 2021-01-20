import Util from 'util';
import { ColumnType } from '../lib/postgres/PostgresTable';
import PostgresValue from '../lib/postgres/PostgresValue';


function columnsToCreateTableStr(columns: ColumnType[]): string {
    const formatted = [];
    for (const col of columns) {
        const line = '"%s" %s';
        formatted.push(Util.format(line, col.columnName, col.type));
    }

    return formatted.join(', ');
}


function convertToPostgresValues(values: { [key: string]: any }, columns: ColumnType[]): PostgresValue[] {
    const transformed: PostgresValue[] = [];
    const keys = Object.keys(values);
    for (const key of keys) {
        let value = values[key];
        const col: ColumnType = (columns.find((c) => c.columnName === key)) as ColumnType;
        if (!col) continue; // ignored or missing cols

        value = convertFields(col, value);
        transformed.push({ columnName: key, value });
    }

    return transformed;
}

function convertFields(col: ColumnType, value: any) {
    let newValue = value;
    switch (col.type) {
        case 'TIMESTAMP':
            newValue = covertDate(new Date(value));
            break;
        default:
            break;
    }
    return newValue;
}
function covertDate(date: Date): string {
    const dateString =
        date.getUTCFullYear() + '-' +
        ('0' + (date.getUTCMonth() + 1)).slice(-2) + '-' +
        ('0' + date.getUTCDate()).slice(-2) + ' ' +

        date.toLocaleTimeString()
    return dateString;
}

export { columnsToCreateTableStr, convertToPostgresValues, covertDate };
