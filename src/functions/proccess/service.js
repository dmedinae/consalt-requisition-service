"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const { Utils } = require("@inlaweb/consalt-utils-node");
const Constants = require("../../commons/constants/objects");
const moment = require("moment-timezone");

/**
 * Service class.
 * @extends BaseObject
 */
class Service extends BaseObject {
    /**
     * Create a Service.
     */
    constructor() {
        super();
        this.dao = new BaseDao();
        this.table = process.env.TABLE_NAME;
        this.permissionTable = process.env.TABLE_PERMISSIONS_NAME;
    }

    /**
     * Initialize the variables.
     * @param {object} event - The event object.
     * @param {object} context - The context object.
     */
    initialize(event, context) {
        super.initialize(event, context);
        this.dao.initialize(event, context);
    }

    /**
     * Function to save a item.
     * @return {object} The object with the respective PK.
     */
    async proccess() {
        try {
            // Se valida permiso
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["PROCCESS"]);

            const body = this.event.body;

            // validate no duplicated items
            let itemValidation = [];
            for (let item of body.items) {
                if (itemValidation.includes(item.item)) {
                    throw this.createResponse("INVALID_REQUEST", null, {});
                }
                itemValidation.push(item.item);
            }

            let params = {
                indexName: "",
                parameters: [
                    { name: "PK", value: body.PK, operator: "=" }
                ],
                projectionExpression: "PK,SK,project,item,quantity,relation3,realtion4,fileExtension,approverName"
            };
            const requisition = await this.dao.query(this.table, params);

            if (!requisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const header = requisition.find(elem => elem.PK === elem.SK);

            const project = await this.dao.get(this.table, header.project, header.project, "storer,frameProject");
            const frame = project.frameProject ? await this.dao.get(this.table, project.frameProject, project.frameProject, "storer") : undefined;

            if ((frame && frame.storer !== this.tokenData["custom:id"]) || (!frame && project.storer !== this.tokenData["custom:id"])) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }

            const items = requisition.filter(elem => elem.PK !== elem.SK);
            const itemsRequest = [];
            const itemsOut = [];
            const itemsBag = [];

            // Validate quantities
            for (let item of items) {
                let recieveItem = body.items.find(elem => elem.item === item.item);
                if (!recieveItem || (item.quantity < recieveItem.out + recieveItem.request)) {
                    throw this.createResponse("INVALID_REQUEST", null, {});
                }

                recieveItem.bag = item.quantity - recieveItem.out - recieveItem.request;

                if (recieveItem.out > 0) {
                    itemsOut.push({
                        item: item.item,
                        quantity: recieveItem.out
                    });
                }

                if (recieveItem.request > 0) {
                    itemsRequest.push({
                        item: item.item,
                        quantity: recieveItem.request
                    });
                }

                if (recieveItem.bag > 0) {
                    itemsBag.push({
                        item: item.item,
                        quantity: recieveItem.bag
                    });
                }
            }

            let out;
            if (itemsOut.length) {
                const payload = {
                    headers: this.event.headers,
                    body: {
                        requisition: header.PK,
                        frame: frame.PK,
                        project: !frame ? header.project : undefined,
                        destination: !frame ? "ENDD" : header.project,
                        requireDate: header.requireDate,
                        motive: header.motive,
                        observations: header.observations,
                        fileExtension: header.fileExtension,
                        approverName: header.approverName,
                        approverUser: header.approverUser,
                        items: itemsRequest
                    }
                }
                const response = await Utils.invokeLambda(process.env.LAMBDA_REQUEST_CREATE, payload);
                this.createLog("info", "Response OUT", response);
                const responsePayload = JSON.parse(response.Payload);
                out = responsePayload && responsePayload.body ? responsePayload.body.PK : undefined;
            }

            let request;
            if (itemsRequest.length) {
                const payload = {
                    headers: this.event.headers,
                    body: {
                        requisition: header.PK,
                        frame: frame.PK,
                        project: !frame ? header.project : undefined,
                        requireDate: header.requireDate,
                        motive: header.motive,
                        observations: header.observations,
                        items: itemsRequest
                    }
                }
                const response = await Utils.invokeLambda(process.env.LAMBDA_OUT_CREATE, payload);
                this.createLog("info", "Response REQUEST", response);
                const responsePayload = JSON.parse(response.Payload);
                request = responsePayload && responsePayload.body ? responsePayload.body.PK : undefined;
            }

            if (itemsBag.length) {
                const bagPK = project.frameProject ? project.frameProject.replace("FRAM", "BAGF") : header.project.replace("PROJ", "BAGP");
                const putItemsBag = []
                for (let itemBag of itemsBag) {
                    const currentItemBag = await this.dao.get(this.table, bagPK, itemBag.item, "PK");
                    if (!currentItemBag) {
                        putItemsBag.push({
                            PK: bagPK,
                            SK: itemBag.item,
                            quantity: 0
                        });
                    }
                }
                // Insert batch new bag items
                await this.dao.saveBatch(this.table, putItemsBag);

                // Update bag quantities
                let updateBagPromises = [];
                for(let i = 0; i < itemsBag.length; i++) {
                    const updateExpresion = {
                        TableName: this.table,
                        Key: { PK: bagPK, SK: itemsBag[i].item },
                        UpdateExpression: `SET #field = #field + :value`,
                        ExpressionAttributeNames: {"#field": "quantity"},
                        ExpressionAttributeValues: {":value": itemsBag[i].quantity },
                        ReturnValues: "NONE"
                    };
                    updateBagPromises.push(this.dao.dynamodb.update(updateExpresion).promise());
                    if (updateBagPromises.length >= 10 || i === (itemsBag.length - 1)) {
                        await Promise.all(updateBagPromises).catch(error => {
                            this.createLog("error", "Service error", error);
                        });
                        updateBagPromises = [];
                    }
                }
            }

            const transactionOperations = [];

            header.relation3 = header.relation3.replace(Constants.STATUS.APPROVED, Constants.STATUS.PROCCESS);
            header.relation4 = header.relation4 ? header.relation3.replace(Constants.STATUS.APPROVED, Constants.STATUS.PROCCESS) : undefined;
            header.request = request;
            header.out = out;

            for (let item of items) {
                item.relation3 = header.relation3;
                item.relation4 = header.relation4;
                transactionOperations.push(this.createItemUpdateOperation(item, body.PK));
            }

            transactionOperations.push(this.createRequisitionObject(header));

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, body.PK, "PROCCESS");

            return { PK: body.PK, request, out };
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
     createItemUpdateOperation(item, PK) {
        const itemUpdate = {
            relation3: item.relation3,
            relation4: item.relation4
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, PK, item.SK, itemUpdate, setAttributes);
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createRequisitionObject(payload) {
        const approveDate = moment.tz(new Date(), "America/Bogota").format("YYYY-MM-DD");
        const item = {
            relation3: payload.relation3,
            relation4: payload.relation4,
            request: payload.request,
            out: payload.out,
            status: Constants.STATUS.PROCCESS,
            proccessDate: approveDate,
            proccessName: this.tokenData.name,
            proccessUser: this.tokenData["cognito:username"],
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, payload.PK, payload.PK, item, setAttributes);
    }
}

module.exports = Service;
