interface ColumnType {
    columnName: string;
    type: string;
    primary?: boolean;
    unique?: boolean;
};

interface PostgresTable {
    columns: ColumnType[];
    tableName: string;
};

export { ColumnType, PostgresTable };