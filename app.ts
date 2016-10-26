/// <reference path="../typings/node.d.ts" />

import {RoomManagerApi} from "./room-manager-api"
const debug = require('debug')('app:main')
const nconf = require('nconf')

import {database} from '../common/db'

////////////////////////////////////////////////////////////////////////////////
//
// Configuration
//
////////////////////////////////////////////////////////////////////////////////

nconf.argv().env().defaults({
    'port': 3001,
    'database': 'mongodb://localhost/sl'
})

const port = nconf.get('port')
const databaseUri = nconf.get('database')

debug('port: ' + port)
debug('database URI: ' + databaseUri)

////////////////////////////////////////////////////////////////////////////////
//
// Set up web server.
//
////////////////////////////////////////////////////////////////////////////////

const express = require('express')          // call express
const app = express()                       // define our app using express
const bodyParser = require('body-parser')

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())

// Test route to make sure everything is working.
app.get('/', (req, res) => res.json({message: 'Hello World'}))

////////////////////////////////////////
//
//  LSL API
//
////////////////////////////////////////

const roomManagerApi = new RoomManagerApi()
app.get('/api/room', roomManagerApi.httpHandlers.all)
app.get('/api/room/:number', roomManagerApi.httpHandlers.list)
app.post('/api/room', roomManagerApi.httpHandlers.add)
app.delete('/api/room/:number/:agent', roomManagerApi.httpHandlers.remove)


////////////////////////////////////////////////////////////////////////////////
//
// Start everything
//
////////////////////////////////////////////////////////////////////////////////

database.uri = databaseUri
database.connect()
    .then(() => {
        debug('Connected to the database at ' + databaseUri)

        roomManagerApi.setDatabase(database)

        app.listen(port)
    })
    .catch((error) => debug("Failed to connect to the database at " + databaseUri, error))



