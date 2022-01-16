"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const Constants = require("../../commons/constants/objects");
const { Utils } = require("@inlaweb/consalt-utils-node");
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
        this.bucketName = process.env.BUCKET_NAME;
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
            const searchParameters = this.createSearchParameters();
            const permission = await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, this.actions);
            if (permission === "OWNS") {
                searchParameters.parameters.push({
                    name: "creationUser",
                    value: this.tokenData["cognito:username"],
                    operator: "FILTER",
                    filterOperator: "=",
                });
            }
            let result;
            const data = await this.dao.query(this.table, searchParameters);
            /*
            if ((this.tokenData.profile == "PROF4" || this.tokenData.profile == "PROF5" || this.tokenData.profile == "PROF6" || this.tokenData.profile == "PROF7") && !this.event.body.project){
                let params = {
                    indexName: "GSI4",
                    parameters: [
                        { name: "entity", value: Constants.ENTITY_PROJ, operator: "=" },
                        { name: "relation4", value: `${this.tokenData["custom:id"]}|`, operator: "begins_with" }
                    ],
                    projectionExpression: "PK"
                };
                const projectsQuery = await this.dao.query(this.table, params);
                const projects = projectsQuery.map(element => element.PK);
                result = data.filter(item => projects.includes(item.project));
            }else{
                result = data;
            }*/
            result = data;
            // Si se consulta por PK y tiene adjunto se agrega
            if (this.event.body.PK) {
                const header = result.filter(item => item.SK === this.event.body.PK);
                if (header[0] && header[0].fileExtension) {
                    try {
                        header[0].urlAtt = await Utils.getFileSignedUrlGet(`${Constants.ENTITY}/${this.event.body.PK}_${this.event.body.PK}.${header[0].fileExtension}`);
                    } catch (error) {
                        this.createLog("error", "Service error getting de url file", error);
                    }
                }
            }
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
        const startDate = moment(this.event.body.startDate).format("YYYY-MM-DD");
        const finishDate = moment(this.event.body.finishDate).add(1, "day").format("YYYY-MM-DD");
        const body = this.event.body;
        let entity = Constants.ENTITY;
        let searchParameters = {};
        this.actions = ["UPDATE", "PRINT"];
        searchParameters.projectionExpression = Constants.SEARCH_PROJECTION;
        if (body.type) {
            this.actions = ["REPORT"];
            entity = body.type;
            searchParameters.projectionExpression = entity === Constants.ENTITY ? Constants.REPORT_PROJECTION : Constants.REPORT_ITEMS_PROJECTION;
        }

        if (body.startDate && body.finishDate && body.status) {
            searchParameters.indexName = "GSI3";
            searchParameters.parameters = [
                { name: "entity", value: entity, operator: "=" },
                { name: "relation3", value: `${body.status}|${body.project}|${startDate}`, value1: `${body.status}|${body.project}|${finishDate}`, operator: "BETWEEN" },
            ];
        } else if (body.startDate && body.finishDate) {
            searchParameters.indexName = "GSI1";
            searchParameters.parameters = [
                { name: "entity", value: entity, operator: "=" },
                { name: "relation1", value: `${body.project}|${startDate}`, value1: `${body.project}|${finishDate}`, operator: "BETWEEN" },
            ];
        } else if (body.status) {
            searchParameters.indexName = "GSI3";
            searchParameters.parameters = [
                { name: "entity", value: entity, operator: "=" },
                { name: "relation3", value: `${body.status}|${body.project}|`, operator: "begins_with" },
            ];
        } else if (body.project) {
            searchParameters.indexName = "GSI1";
            searchParameters.parameters = [
                { name: "entity", value: entity, operator: "=" },
                { name: "relation1", value: `${body.project}|`, operator: "begins_with" },
            ];
        } else if (this.event.body.PK) {
            searchParameters.projectionExpression = Constants.PK_PROJECTION;
            searchParameters.indexName = "";
            searchParameters.parameters = [{ name: "PK", value: this.event.body.PK, operator: "=" }];
        }
        return searchParameters;
    }
}

module.exports = Service;
