"use strict";

const Service = require("./service");
const service = new Service();

module.exports.events = async (event, context) => {
    service.initialize(event, context);
    service.createLog("info", "Request", event);

    try {
        switch (event.eventType) {
            case "outCreated":
                await service.associate();
                break;
            case "inCreated":
                await service.associate();
                break;
            default:
                throw Error("No handler for the event");
        }
    } catch (error) {
        console.log(error);
        service.createLog("error", "Error", error);
    }

    return true;
};
