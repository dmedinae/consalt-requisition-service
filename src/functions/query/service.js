"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const Constants = require("../../commons/constants/objects");
const moment = require("moment-timezone");
const S3 = require("aws-sdk").S3;

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
        this.s3 = new S3();
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
            // Si se consulta por PK y tiene adjunto se agrega
            if (this.event.body.PK) {
                let header = result.filter(item => item.SK === this.event.body.PK);
                if (header[0] && header[0].fileExtension) {
                    try {
                        // Parametros para generar la URL firmada
                        const params = {
                            Bucket: this.bucketName,
                            Key: `${Constants.ENTITY}/${this.event.body.PK}_${this.event.body.PK}.${header[0].fileExtension}`,
                            Expires: 43200,
                        };
                        const url = await this.s3.getSignedUrlPromise("getObject", params);
                        header[0].urlAtt = url;
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
        if (body.startDate && body.finishDate) {
            let index = "GSI1";
            let relation = "relation1";
            let project = "";
            let creationUser = "";
            if (body.creationUser && body.project) {
                creationUser = `${body.creationUser}|`;
                project = `${body.project}|`;
            } else if (body.creationUser) {
                index = "GSI2";
                relation = "relation2";
                creationUser = `${body.creationUser}|`;
            } else if (body.project) {
                project = `${body.project}|`;
            }
            searchParameters.indexName = index;
            searchParameters.parameters = [
                { name: "entity", value: entity, operator: "=" },
                { name: relation, value: `${startDate}|${project}${creationUser}`, value1: `${finishDate}|${project}${creationUser}`, operator: "BETWEEN" },
            ];
        } else if (body.project || body.creationUser) {
            let index = "GSI3";
            let relation = "relation3";
            let value = "";
            if (body.creationUser && body.project) {
                value = `${body.creationUser}|${body.project}|`;
            } else if (body.creationUser) {
                value = `${body.creationUser}|`;
            } else if (body.project) {
                index = "GSI4";
                relation = "relation4";
                value = `${body.project}|`;
            }
            searchParameters.indexName = index;
            searchParameters.parameters = [
                { name: "entity", value: entity, operator: "=" },
                { name: relation, value: value, operator: "begins_with" },
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
