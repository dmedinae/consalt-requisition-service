"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const Constants = require("../../commons/constants/objects");

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
    async readyProccess() {
        try {
            const response = [];

            // Se valida permiso
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["PROCCESS"]);

            // Query for frames where user is storer
            let params = {
                indexName: "GSI6",
                parameters: [
                    { name: "entity", value: "FRAM", operator: "=" },
                    { name: "relation6", value: this.tokenData["custom:id"], operator: "begins_with" }
                ],
                projectionExpression: "PK"
            };
            const framesWhereUserIsStorer = await this.dao.query(this.table, params);

            if (!framesWhereUserIsStorer.length) {
                return [];
            }

            for (let frame of framesWhereUserIsStorer) {
                params = {
                    indexName: "GSI4",
                    parameters: [
                        { name: "entity", value: Constants.ENTITY, operator: "=" },
                        { name: "relation4", value: `${Constants.STATUS.APPROVED}|${frame.PK}|`, operator: "begins_with" }
                    ],
                    projectionExpression: "PK,creationDate,project,status,projectName,creatorName"
                };
                const result = await this.dao.query(this.table, params);
                response.push(...result);
            }

            return response;
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }
}

module.exports = Service;
