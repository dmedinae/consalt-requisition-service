"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
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
    async update() {
        try {
            // Se valida permiso a la opción de creación
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["APPROVE"]);

            const transactionOperations = [];
            const body = this.event.body;

            const params = {
                indexName: "",
                parameters: [{ name: "PK", value: body.PK, operator: "=" }],
            };
            const currentRequisition = await this.dao.query(this.table, params);
            if (!currentRequisition[0]) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const project = await this.dao.get(this.table, currentRequisition.project, currentRequisition.project);

            if(currentRequisition !== Constants.STATUS.PENDING_APPROVAL || project.projectManager !== this.tokenData["cognito:username"]) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }
            // Se completan datos en el header
            body.relation5 = currentRequisition.relation5.replace(currentRequisition.status, body.status);

            for (let element of currentRequisition) {
                if (element.PK !== element.SK) {
                    element.relation5 = body.relation5;
                    transactionOperations.push(this.createItemUpdateOperation(element, body.PK));
                }
            }

            // Se construye el encabezado
            transactionOperations.push(this.createRequisitionObject(body))

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, PK, "APPROVE");

            // Se retorna el id insertado
            return { PK };
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
            relation5: item.relation5
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
            relation5: payload.relation5,
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
