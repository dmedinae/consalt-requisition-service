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
                    { name: "PK", value: "FRAM", operator: "=" },
                    { name: "relation6", value: this.tokenData["custom:id"], operator: "=" }
                ],
                projectionExpression: "PK"
            };
            const framesWhereUserIsStorer = await this.dao.query(this.table, params);
            // Query for projects where user is storer
            params = {
                indexName: "GSI6",
                parameters: [
                    { name: "PK", value: "PROJ", operator: "=" },
                    { name: "relation6", value: this.tokenData["custom:id"], operator: "=" }
                ],
                projectionExpression: "PK"
            };
            const projectsWhereUserIsStorer = await this.dao.query(this.table, params);

            if (!framesWhereUserIsStorer.length && !projectsWhereUserIsStorer.length ) {
                return [];
            }

            for (let frame of framesWhereUserIsStorer) {
                params = {
                    indexName: "GSI4",
                    parameters: [
                        { name: "PK", value: Constants.ENTITY, operator: "=" },
                        { name: "relation4", value: `${Constants.STATUS.APPROVED}|${frame.PK}`, operator: "=" }
                    ],
                    projectionExpression: "PK,creationDate,project,status,projectName,creatorName"
                };
                const result = await this.dao.query(this.table, params);
                response.push(...result);
            }

            for (let project of projectsWhereUserIsStorer) {
                params = {
                    indexName: "GSI3",
                    parameters: [
                        { name: "PK", value: Constants.ENTITY, operator: "=" },
                        { name: "relation3", value: `${Constants.STATUS.APPROVED}|${project.PK}`, operator: "=" }
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
