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
    async readyApprove() {
        try {
            const response = [];

            // Se valida permiso
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["APPROVE"]);

            // Query for projects where user is manager
            let params = {
                indexName: "GSI5",
                parameters: [
                    { name: "entity", value: "PROJ", operator: "=" },
                    { name: "relation5", value: `${this.tokenData["custom:id"]}|`, operator: "begins_with" }
                ],
                projectionExpression: "PK"
            };
            const projectsWhereUserIsController = await this.dao.query(this.table, params);

            if (!projectsWhereUserIsController.length ) {
                return [];
            }

            for (let project of projectsWhereUserIsController) {
                params = {
                    indexName: "GSI3",
                    parameters: [
                        { name: "entity", value: Constants.ENTITY, operator: "=" },
                        { name: "relation3", value: `${Constants.STATUS.PENDING_APPROVAL}|${project.PK}|`, operator: "begins_with" }
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
