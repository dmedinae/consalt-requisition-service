"use strict";

const Service = require("./service");
const SCHEMA = require("../../../resources/schemas/updateRQ.json");
const service = new Service();

global.ErrorResponses = require("../../commons/constants/errorResponses");
global.SuccessResponses = require("../../commons/constants/successResponses");

module.exports.update = async (event, context) => {
    service.initialize(event, context);
    service.createLog("info", "Request", event.body);
    let response = null;

    try {
        service.validateRequest(SCHEMA, event.body);
        const result = await service.update();
        response = service.createResponse("SUCCESS", result);
    } catch (error) {
        service.createLog("error", "Error", error);
        return service.createLambdaResponse(error);
    }

    service.createLog("info", "Response", response);

    return service.createLambdaResponse(response);
};
