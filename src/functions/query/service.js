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
        this.actions = [];
    }

    initialize(event, context) {
        super.initialize(event, context);
        this.dao.initialize(event, context);
    }

    /**
     * Function to query on DDB.
     * @return {object} The result set of the query.
     */
    async query() {
        try {
            let searchParameters = this.createSearchParameters();
            let permission = await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, this.actions);
            if (permission === "OWNS") {
                searchParameters.parameters.push({
                    name: "creationUser",
                    value: this.tokenData["cognito:username"],
                    operator: "FILTER",
                    filterOperator: "=",
                });
            }
            let result = await this.dao.query(this.table, searchParameters);
            return this.createResponse("SUCCESS", result);
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }

    /**
     * Function to create the searchParameters object.
     * @return {object} The object with the config of the query.
     */
    createSearchParameters() {
        let searchParameters = {};
        this.actions = ["UPDATE", "PRINT"];
        searchParameters.projectionExpression = Constants.SEARCH_PROJECTION;
        if (this.event.body.typeSearch === 'R') {
            this.actions = ["REPORT"];
            searchParameters.projectionExpression = Constants.REPORT_PROJECTION;
        }
        if (this.event.body.enterprise && this.event.body.startDate && this.event.body.finishDate) {
            searchParameters.indexName = "GSI1";
            searchParameters.parameters = [
                { name: "entity", value: Constants.ENTITY, operator: "=" },
                { name: "relation1", value: `${this.event.body.enterprise}|${this.event.body.startDate}`, value1: `${this.event.body.enterprise}|${this.event.body.finishDate}`, operator: "BETWEEN" },
            ];
        } else if (this.event.body.enterprise) {
            searchParameters.indexName = "GSI1";
            searchParameters.parameters = [
                { name: "entity", value: Constants.ENTITY, operator: "=" },
                { name: "relation1", value: `${this.event.body.enterprise}|`, operator: "begins_with" },
            ];
        } else if (this.event.body.startDate && this.event.body.finishDate) {
            searchParameters.indexName = "GSI2";
            searchParameters.parameters = [
                { name: "entity", value: Constants.ENTITY, operator: "=" },
                { name: "relation2", value: `${this.event.body.startDate}`, value1: `${this.event.body.finishDate}`, operator: "BETWEEN" },
            ];
        } else if (this.event.body.id) {
            this.actions = ["UPDATE", "PRINT"];
            searchParameters.projectionExpression = Constants.SEARCH_PROJECTION;
            searchParameters.indexName = "";
            searchParameters.parameters = [
                { name: "PK", value: `REMI${this.event.body.id}`, operator: "=" },
                { name: "SK", value: `REMI${this.event.body.id}`, operator: "=" },
            ];
        } else if (this.event.body.PK) {
            this.actions = ["UPDATE", "PRINT"];
            searchParameters.projectionExpression = Constants.PK_PROJECTION;
            searchParameters.indexName = "";
            searchParameters.parameters = [{ name: "PK", value: this.event.body.PK, operator: "=" }];
        }
        return searchParameters;
    }
}

module.exports = Service;
