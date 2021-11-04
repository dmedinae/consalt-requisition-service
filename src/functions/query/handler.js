"use strict";

const Service = require("./service");
const SCHEMA = require("../../../resources/schemas/remissionQueryRQ.json");
const service = new Service();

global.ErrorResponses = require("../../commons/constants/errorResponses");
global.SuccessResponses = require("../../commons/constants/successResponses");

module.exports.query = async (event, context) => {
    service.initialize(event, context);
    service.createLog("info", "Request", event.body);
    let response = null;

    try {
        service.validateRequest(SCHEMA, event.body);
        response = await service.query();
    } catch (error) {
        service.createLog("error", "Error", error);
        return service.createLambdaResponse(error);
    }

    service.createLog("debug", "Response", response);
    service.createLog("info", "Response", true);

    return service.createLambdaResponse(response);
};
