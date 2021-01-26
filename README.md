
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
    <li><a href="#attribution">Attribution</a></li>
  </ol>
</details>

## About
Mopo is a simple cli tool for replicating MongoDB to PostgreSQL in realtime.

## Installation
```
git clone https://github.com/rebellionpay/mopo mopo && cd mopo
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
            "options": {
                "useNewUrlParser": true,
                "useUnifiedTopology": true,
                "auto_reconnect": true
            }
        },
        "collectionModels": {
            "users": {
                "_id": {
                    "type": "TEXT",
                    "primary": true
                },
                "email": {
                    "type": "TEXT"
                },
                "name": {
                    "type": "TEXT"
                },
                "createdAt": {
                    "type": "TIMESTAMP"
                },
                "updatedAt": {
                    "type": "TIMESTAMP"
                }
            }
        }
    },
    "postgres": {
        "connection": {
            "config": {
                "host": "localhost",
                "database": "exampleDB"
            }
        }
    },
    "sync": [
        {
            "collection": "users",
            "syncAll": true,
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
- `BOOLEAN`
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
  -sa, --sync-all            Sync all data first if schema syncAll enabled
  -bi, --bulk-insert <number>  Number of documents to insert at once (only works if --sync-all enabled). Default 10.
  -l, --log-level <level>    Log level
  -h, --help                 display help for command
```

## Attribution

<div>Icons made by <a href="https://www.flaticon.com/authors/icongeek26" title="Icongeek26">Icongeek26</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a></div>
