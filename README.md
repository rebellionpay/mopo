
<h1 align="center">
<img src="icon.svg" width="120">
    <p>
    MOPO
    </p>
</h1>


<details open="open">
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about">About</a></li>
    <li><a href="#installation">Installation</a></li>
    <li><a href="#installation">Configuration</a></li>
    <li><a href="#installation">Usage</a></li>
  </ol>
</details>

## About
Mopo is a simple cli tool for replicating MongoDB to PostgreSQL in realtime.

## Installation
```
git clone <uri> mopo && cd mopo
npm i
npm run build
```

## Preparation

### MongoDB

Mopo uses [Replica Set](http://docs.mongodb.org/manual/replication/) feature in MongoDB. But you don't have to replicate between MongoDB actually. Just follow the steps below.

Start a new mongo instance with no data:

```bash
$ mongod --replSet "rs0" --oplogSize 100
```

Open another terminal, and go to MongoDB Shell:

```bash
$ mongo
....
> rs.initiate()
```

`rs.initiate()` command prepare the collections that is needed for replication.

### PostgreSQL

Launch postgres instance, and create the new database to use.


### Configuration

Create a new `.mopo.json` file like this:

```json
{
    "mongo": {
        "connection": {
            "uri": "<MONGOQUERY>",
            "options": { // MONGO connection options
                "useNewUrlParser": true,
                "useUnifiedTopology": true,
                "auto_reconnect": true
            }
        },
        "collectionModels": {
            "users": {
                "_id": "TEXT",
                "email": "TEXT",
                "name": "TEXT",
                "createdAt": "TIMESTAMP",
                "updatedAt": "TIMESTAMP"
            }
        }
    },
    "postgres": {
        "connection": {
            "config": { // postgres config
                "host": "localhost",
                "database": "exampleDB"
            }
        }
    },
    "sync": [
        {
            "collection": "users",
            "watchOperations": [
                "INSERT",
                "UPDATE"
            ]
        }
    ]
}
```

`_id` field is required for each collection and should be `string`.

### Field names and types

Currently these native types are supported:

- `BIGINT`
- `TINYINT`
- `VARCHAR`
- `DATE`
- `TIMESTAMP`
- `TEXT`

## Usage

```bash
node dist/index.js --start .mopo.json --log-level debug

Usage: index [options]

Options:
  -s, --start <config file>  start sync with config file
  -sa, --sync-all            Sync all data first
  -l, --log-level <level>    Log level
  -h, --help                 display help for command
```