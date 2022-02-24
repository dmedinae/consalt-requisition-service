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
    async updateStatus() {
        try {
            const permission = this.tokenData.profile == "PROF9" ? "ANNUL" : "APPROVE";
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, [permission]);

            const transactionOperations = [];
            const body = this.event.body;

            const params = {
                indexName: "",
                parameters: [{ name: "PK", value: body.PK, operator: "=" }],
                projectionExpression: "PK,SK,project,status,relation3,relation4,family,group,value,quantity,creationDate,creationUser,affectBudget"
            };
            const current = await this.dao.query(this.table, params);
            if (!current.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const header = current.find(element => element.PK === element.SK);
            const project = await this.dao.get(this.table, header.project, header.project, "controller");

            if (this.tokenData.profile == "PROF9"){
                if(header.status !== Constants.STATUS.APPROVED) {
                    throw this.createResponse("INVALID_REQUEST", null, {});
                }
            } else{
                if(header.status !== Constants.STATUS.PENDING_APPROVAL || project.controller !== this.tokenData["custom:id"]) {
                    throw this.createResponse("INVALID_REQUEST", null, {});
                }
            }
            // Se completan datos en el header
            body.relation3 = header.relation3.replace(header.status, body.status);
            body.relation4 = header.relation4.replace(header.status, body.status);

            for (let element of current) {
                if (element.PK !== element.SK) {
                    element.relation3 = body.relation3;
                    element.relation4 = body.relation4;
                    transactionOperations.push(this.createItemUpdateOperation(element, body.PK));
                }
            }

            // Se construye el encabezado
            transactionOperations.push(this.createRequisitionObject(body))

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, body.PK, permission);

            if (body.status !== Constants.STATUS.APPROVED) {
                await Utils.updateProjectBudget(Constants.ENTITY, undefined, current);
            }

            const mailPayload = {
                "eventType": "requisitionApproval",
                "payload": {
                    "PK": body.PK,
                    "status": body.status,
                    "creationUser": header.creationUser,
                    "approverName": this.tokenData.name,
                    "reason": body.reason
                }
            };
            await Utils.sendMail(mailPayload);
            // Se retorna el id insertado
            return { PK: body.PK };
        } catch (error) {
            console.log(error);
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
            reason: payload.reason,
            status: payload.status,
            approveDate: approveDate,
            approverName: this.tokenData.name,
            approverUser: this.tokenData["cognito:username"],
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, payload.PK, payload.PK, item, setAttributes);
    }
}

module.exports = Service;
