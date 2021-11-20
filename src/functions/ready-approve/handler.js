"use strict";

const Service = require("./service");
const service = new Service();

global.ErrorResponses = require("../../commons/constants/errorResponses");
global.SuccessResponses = require("../../commons/constants/successResponses");

module.exports.readyApprove = async (event, context) => {
    service.initialize(event, context);
    service.createLog("info", "Request", event.body);
    let response = null;

    try {
        const result = await service.readyApprove();
        response = service.createResponse("SUCCESS", result);
    } catch (error) {
        service.createLog("error", "Error", error);
        return service.createLambdaResponse(error);
    }

    service.createLog("debug", "Response", response);
    service.createLog("info", "Response", true);

    return service.createLambdaResponse(response);
};
