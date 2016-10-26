////////////////////////////////////////////////////////////////////////////////
//
// HTTP handler for the avatar sensor.
//
// This accepts the data, parses it, and publishes it to the plugins.
//
// The formatted data is a map with the key being the UUID, and
// the value being an object with the following fields:
//      username: The user name as presented by the LSL code.ty
//      displayName: The user's display name.
//
////////////////////////////////////////////////////////////////////////////////
"use strict";
const debug = require('debug')('app:api');
const datetime_1 = require("../lib/datetime");
const notification_bus_client_1 = require("../lib/notification-bus/notification-bus-client");
const notification_packager_1 = require("../lib/notification-bus/notification-packager");
const rooms_1 = require("../lib/rooms");
const SUCCESS_ALL = 299;
const SUCCESS_ROOM = 298;
const SUCCESS_ADD = 297;
const SUCCESS_DELETE = 296;
class HttpHandlers {
    constructor() {
        this.add = (req, res) => {
            let number = req.body.number;
            let agent = req.body.agent;
            if (!number || !agent)
                return this.checkError("Missing data", res);
            debug("add ", number, agent);
            this.db.agents.findOne({ uuid: agent }, (error, record) => {
                if (!this.checkError(error, res))
                    return;
                if (!record)
                    return this.checkError("Agent not found.", res);
                this.db.rooms.findOne({ number: number }, (error, record) => {
                    if (!this.checkError(error, res))
                        return;
                    if (!record)
                        return this.checkError("Room not found.", res);
                    this.db.occupants.find({ room: number, agent: agent }).toArray((error, records) => {
                        if (!this.checkError(error, res))
                            return;
                        if (records.length > 0)
                            return this.checkError("Duplicate", res);
                        // No duplicates so insert a new record.
                        let newRecord = {
                            room: number,
                            agent: agent,
                            when: null
                        };
                        this.db.occupants.insert(newRecord, (error) => {
                            if (!this.checkError(error, res))
                                return;
                            this.notificationBus.send(this.pack.occupant(newRecord));
                            res.status(SUCCESS_ADD).send("");
                        });
                    });
                });
            });
        };
        this.all = (req, res) => {
            debug("all");
            this.db.occupants.find({}).toArray((error, values) => {
                if (!this.checkError(error, res))
                    return;
                this.formatArray(values, (error, body) => {
                    if (!this.checkError(error, res))
                        return;
                    res.status(SUCCESS_ALL).send(body);
                });
            });
        };
        this.list = (req, res) => {
            debug("list");
            let number = req.params.number;
            if (!number)
                return this.checkError("Bad number.", res);
            debug("list ", number);
            this.db.occupants.find({ room: number }).toArray((error, values) => {
                if (!this.checkError(error, res))
                    return;
                if (!values || values.length == 0) {
                    let room = this.rooms.map.get(number) || null;
                    let roomName = room ? room.name : "[unknown]";
                    let body = ["", "[none]", "Unoccupied", roomName, ""].join(";");
                    res.status(SUCCESS_ROOM).send(body);
                    return;
                }
                this.formatArray(values, (error, body) => {
                    if (!this.checkError(error, res))
                        return;
                    res.status(SUCCESS_ROOM).send(body);
                });
            });
        };
        this.remove = (req, res) => {
            let number = req.params.number;
            let agent = req.params.agent;
            if (!number || !agent)
                return this.checkError("Missing data", res);
            debug("remove  ", number, agent);
            this.db.occupants.find({ room: number, agent: agent }).toArray((error, values) => {
                if (!this.checkError(error, res))
                    return;
                let ids = values.map((x) => x._id);
                this.db.occupants.remove({ _id: { $in: ids } }, (error) => {
                    if (!this.checkError(error, res))
                        return;
                    for (let id of ids)
                        this.notificationBus.send(this.pack.remove.occupant({ _id: id }));
                    res.status(SUCCESS_DELETE).send("");
                });
            });
        };
        this.setDatabase = (database) => {
            this.db = database;
            this.rooms = new rooms_1.Rooms(database);
            this.rooms.load();
        };
        this.agentListToMap = (list) => {
            let result = {};
            for (let agent of list) {
                if (agent)
                    result[agent.uuid] = agent;
            }
            return result;
        };
        this.checkError = (error, res) => {
            if (error) {
                debug("" + error);
                res.statusMessage = "" + error;
                res.status(400).end();
                return false;
            }
            return true;
        };
        this.formatArray = (values, callback) => {
            if (typeof callback !== "function")
                return;
            // It's easier to get this information in the server than in SL.
            // Get a list of agent UUIDs to fetch.
            let uuids = [];
            for (const value of values) {
                if (value)
                    uuids.push(value.agent);
            }
            // Grab those agent records into an array
            this.db.agents.find({ uuid: { $in: uuids } }).toArray((error, agentList) => {
                if (error) {
                    callback(error, null);
                    return;
                }
                // Turn the array into a map so we can key by UUID.
                let map = this.agentListToMap(agentList);
                let result = [];
                for (const value of values) {
                    if (value) {
                        let when;
                        if (value.when == null)
                            when = "";
                        else
                            when = datetime_1.formatSLT(value.when, 'll');
                        let displayName = "";
                        let username = "";
                        if (map[value.agent]) {
                            username = map[value.agent].username;
                            displayName = map[value.agent].displayName;
                        }
                        let room = this.rooms.map.has(value.room) ? this.rooms.map.get(value.room) : null;
                        let roomName = room ? room.name : "[unknown]";
                        result.push([value.agent, username, displayName, roomName, when].join(";"));
                    }
                }
                callback(null, result.join("\n"));
            });
        };
        this.notificationBus = new notification_bus_client_1.NotificationBusClient();
        this.pack = new notification_packager_1.NotificationPackager();
    }
}
class RoomManagerApi {
    constructor() {
        this.setDatabase = (database) => {
            this.db = database;
            this.httpHandlers.setDatabase(database);
        };
        this.httpHandlers = new HttpHandlers();
    }
}
exports.RoomManagerApi = RoomManagerApi;
//# sourceMappingURL=room-manager-api.js.map