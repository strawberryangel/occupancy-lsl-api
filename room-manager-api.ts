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

const debug = require('debug')('app:api')

import {CommonDatabaseConnection} from "../lib/common-database-connection"
import {formatSLT} from "../lib/datetime"
import {NotificationBusClient} from "../lib/notification-bus/notification-bus-client"
import {NotificationPackager} from "../lib/notification-bus/notification-packager"
import {Occupant} from "../lib/occupant"
import {Rooms} from "../lib/rooms"

const SUCCESS_ALL = 299;
const SUCCESS_ROOM = 298;
const SUCCESS_ADD = 297;
const SUCCESS_DELETE = 296;

class HttpHandlers {
    private db: CommonDatabaseConnection
    private notificationBus: NotificationBusClient
    private pack: NotificationPackager
    private rooms: Rooms

    constructor() {
        this.notificationBus = new NotificationBusClient()
        this.pack = new NotificationPackager()
    }

    public add = (req: any, res: any): any => {
        let number = req.body.number
        let agent = req.body.agent
        if (!number || !agent) return this.checkError("Missing data", res)
        debug("add ", number, agent)

        this.db.agents.findOne({uuid: agent}, (error, record) => {
            if (!this.checkError(error, res)) return
            if (!record) return this.checkError("Agent not found.", res)

            this.db.rooms.findOne({number: number}, (error, record) => {
                if (!this.checkError(error, res)) return
                if (!record) return this.checkError("Room not found.", res)

                this.db.occupants.find({room: number, agent: agent}).toArray((error, records) => {
                    if (!this.checkError(error, res)) return
                    if (records.length > 0) return this.checkError("Duplicate", res)

                    // No duplicates so insert a new record.
                    let newRecord = {
                        room: number,
                        agent: agent,
                        when: null
                    } as Occupant
                    this.db.occupants.insert(newRecord, (error) => {
                        if (!this.checkError(error, res)) return

                        this.notificationBus.send(this.pack.occupant(newRecord))
                        res.status(SUCCESS_ADD).send("")
                    })
                })
            })
        })
    }

    public all = (req: any, res: any): any => {
        debug("all")
        this.db.occupants.find({}).toArray((error, values) => {
            if (!this.checkError(error, res)) return

            this.formatArray(values, (error, body) => {
                if (!this.checkError(error, res)) return

                res.status(SUCCESS_ALL).send(body)
            })
        })
    }

    public list = (req: any, res: any): any => {
        debug("list")
        let number = req.params.number
        if (!number) return this.checkError("Bad number.", res)
        debug("list ", number)

        this.db.occupants.find({room: number}).toArray((error, values) => {
            if (!this.checkError(error, res)) return

            if (!values || values.length == 0) {
                let room = this.rooms.map.get(number) || null
                let roomName = room ? room.name : "[unknown]"
                let body = ["", "[none]", "Unoccupied", roomName, ""].join(";")
                res.status(SUCCESS_ROOM).send(body)
                return
            }

            this.formatArray(values, (error, body) => {
                if (!this.checkError(error, res)) return

                res.status(SUCCESS_ROOM).send(body)
            })
        })
    }

    public remove = (req: any, res: any): any => {
        let number = req.params.number
        let agent = req.params.agent
        if (!number || !agent) return this.checkError("Missing data", res)
        debug("remove  ", number, agent)

        this.db.occupants.find({room: number, agent: agent}).toArray((error, values) => {
            if (!this.checkError(error, res)) return

            let ids = values.map((x) => x._id)

            this.db.occupants.remove({_id: {$in: ids}}, (error) => {
                if (!this.checkError(error, res)) return

                for (let id of ids)
                    this.notificationBus.send(this.pack.remove.occupant({_id: id} as Occupant))

                res.status(SUCCESS_DELETE).send("")
            })
        })
    }

    public setDatabase = (database) => {
        this.db = database
        this.rooms = new Rooms(database)
        this.rooms.load()
    }


    private agentListToMap = (list) => {
        let result = {}
        for (let agent of list) {
            if (agent) result[agent.uuid] = agent
        }

        return result
    }

    private checkError = (error, res): boolean => {
        if (error) {
            debug("" + error)
            res.statusMessage = "" + error
            res.status(400).end()
            return false
        }

        return true
    }


    private formatArray = (values, callback) => {
        if (typeof callback !== "function") return

        // It's easier to get this information in the server than in SL.

        // Get a list of agent UUIDs to fetch.
        let uuids = []
        for (const value of values) {
            if (value) uuids.push(value.agent)
        }

        // Grab those agent records into an array
        this.db.agents.find({uuid: {$in: uuids}}).toArray((error, agentList) => {
            if (error) {
                callback(error, null)
                return
            }

            // Turn the array into a map so we can key by UUID.
            let map = this.agentListToMap(agentList)

            let result = []
            for (const value of values) {
                if (value) {
                    let when: string
                    if (value.when == null)
                        when = ""
                    else
                        when = formatSLT(value.when, 'll')

                    let displayName: string = ""
                    let username: string = ""
                    if (map[value.agent]) {
                        username = map[value.agent].username
                        displayName = map[value.agent].displayName
                    }

                    let room = this.rooms.map.has(value.room) ? this.rooms.map.get(value.room) : null
                    let roomName = room ? room.name : "[unknown]"
                    result.push([value.agent, username, displayName, roomName, when].join(";"))
                }
            }

            callback(null, result.join("\n"))
        })
    }
}

export class RoomManagerApi {
    private db: CommonDatabaseConnection
    public httpHandlers: HttpHandlers

    constructor() {
        this.httpHandlers = new HttpHandlers()
    }

    public setDatabase = (database) => {
        this.db = database
        this.httpHandlers.setDatabase(database)
    }
}
