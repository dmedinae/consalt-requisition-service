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
                ]
            };
            const requisition = await this.dao.query(this.table, params);

            if (!requisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const header = requisition.find(elem => elem.PK === elem.SK);

            const project = await this.dao.get(this.table, header.project, header.project, "PK,storer,frameProject");
            const frame = await this.dao.get(this.table, project.frameProject, project.frameProject, "PK,storer");

            if (frame.storer !== this.tokenData["custom:id"] || !frame || !project || header.status !== Constants.STATUS.APPROVED) {
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
                item.associateQuantityOut = 0;

                if (recieveItem.out > 0) {
                    itemsOut.push({
                        item: item.item,
                        quantity: recieveItem.out
                    });
                    item.associateOut = item.associateOut ? item.associateOut : [];
                }

                if (recieveItem.request > 0) {
                    itemsRequest.push({
                        item: item.item,
                        quantity: recieveItem.request
                    });
                    item.associateRequest = item.associateRequest ? item.associateRequest : [];
                }

                if (recieveItem.bag > 0) {
                    itemsBag.push({
                        item: item.item,
                        project: item.project,
                        family: item.family,
                        familyName: item.familyName,
                        group: item.group,
                        groupName: item.groupName,
                        type: item.type,
                        typeName: item.typeName,
                        category: item.category,
                        categoryName: item.categoryName,
                        code: item.code,
                        name: item.name,
                        unity: item.unity,
                        unityName: item.unityName,
                        affectBudget: item.affectBudget,
                        value: item.value,
                        quantity: recieveItem.bag
                    });
                    item.bagQuantity = recieveItem.bag
                }
            }

            let out;
            if (itemsOut.length) {
                const payload = {
                    headers: this.event.headers,
                    body: {
                        requisition: header.PK,
                        frame: frame.PK,
                        destination: header.project,
                        requireDate: header.requireDate,
                        motive: header.motive,
                        observations: header.observations,
                        approverName: header.approverName,
                        approverUser: header.approverUser,
                        requesterName: header.creatorName,
                        requesterAreaName: header.creatorAreaName,
                        requesterPositionName: header.creatorPositionName,
                        costCenter: header.projectCostCenter,
                        items: itemsOut
                    }
                }
                const response = await Utils.invokeLambda(process.env.LAMBDA_OUT_CREATE, payload);
                this.createLog("info", "Response OUT", response);
                const responsePayload = JSON.parse(response.Payload);
                const body = responsePayload && responsePayload.body ? JSON.parse(responsePayload.body) : undefined;
                out = body && body.body ? body.body.PK : undefined;
            }

            let request;
            if (itemsRequest.length) {
                const payload = {
                    headers: this.event.headers,
                    body: {
                        requisition: header.PK,
                        fileExtension: header.fileExtension,
                        approverName: header.approverName,
                        approverUser: header.approverUser,
                        frame: frame.PK,
                        project: header.project,
                        requireDate: header.requireDate,
                        motive: header.motive,
                        observations: header.observations,
                        requesterName: header.creatorName,
                        requesterAreaName: header.creatorAreaName,
                        requesterPositionName: header.creatorPositionName,
                        costCenter: header.projectCostCenter,
                        items: itemsRequest
                    }
                }
                const response = await Utils.invokeLambda(process.env.LAMBDA_REQUEST_CREATE, payload);
                this.createLog("info", "Response REQUEST", response);
                const responsePayload = JSON.parse(response.Payload);
                const body = responsePayload && responsePayload.body ? JSON.parse(responsePayload.body) : undefined;
                request = body && body.body ? body.body.PK : undefined;
            }

            if (itemsBag.length) {
                const bagPK = project.frameProject.replace("FRAM", "BAGF");
                const putItemsBag = []
                for (let itemBag of itemsBag) {
                    const currentItemBag = await this.dao.get(this.table, bagPK, itemBag.item, "PK");
                    if (!currentItemBag) {
                        putItemsBag.push({
                            PK: bagPK,
                            SK: itemBag.item,
                            project: itemBag.project,
                            family: itemBag.family,
                            familyName: itemBag.familyName,
                            group: itemBag.group,
                            groupName: itemBag.groupName,
                            type: itemBag.type,
                            typeName: itemBag.typeName,
                            category: itemBag.category,
                            categoryName: itemBag.categoryName,
                            code: itemBag.code,
                            name: itemBag.name,
                            unity: itemBag.unity,
                            unityName: itemBag.unityName,
                            affectBudget: itemBag.affectBudget,
                            value: itemBag.value,
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
            header.relation4 = header.relation4.replace(Constants.STATUS.APPROVED, Constants.STATUS.PROCCESS);
            header.request = request;
            header.out = out;

            for (let item of items) {
                item.relation3 = header.relation3;
                item.relation4 = header.relation4;
                if (out && item.associateOut) item.associateOut.push(out);
                if (request && item.associateRequest) item.associateRequest.push(request);
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
            relation4: item.relation4,
            associateOut: item.associateOut,
            associateRequest: item.associateRequest,
            bagQuantity: item.bagQuantity,
            associateQuantityOut: item.associateQuantityOut,
        };
        const setAttributes = Object.keys(itemUpdate);
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
            associateOut: payload.associateOut,
            associateRequest: payload.associateRequest,
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
