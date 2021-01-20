interface ColumnType {
    columnName: string;
    type: string;
};

interface PostgresTable {
    columns: ColumnType[];
    tableName: string;
};

export { ColumnType, PostgresTable };